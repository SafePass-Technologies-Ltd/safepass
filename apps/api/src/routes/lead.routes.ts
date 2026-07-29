/**
 * Lead Routes — marketing lead intake from SafePassLanding.
 *
 *   POST  /v1/leads             — public-ish intake (service-key auth), called
 *                                 by the landing site's Lead Intake Service
 *   GET   /v1/admin/leads       — list captured leads (admin)
 *   PATCH /v1/admin/leads/:id   — update triage status / notes (admin)
 *
 * Auth model for the intake endpoint: the landing site's server-side route
 * handler (`apps/landing/src/app/api/leads/route.ts`) calls this with a shared
 * service key. It is NOT `authMiddleware`-protected, because the submitting
 * visitor is anonymous by definition — a marketing site has no accounts (see
 * docs/SafePassLanding/architecture.md's "Authentication & Authorization:
 * None"). The service key exists so this endpoint can't be scraped into a spam
 * firehose by anyone who finds the URL; it is never exposed to the browser.
 *
 * See docs/SafePassLanding/features.md FEAT-012 and risk_log.md R-004.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { eq, desc, and, type SQL } from 'drizzle-orm';
import { LeadPayloadSchema } from '@safepass/shared';
import { db } from '../db';
import { leads } from '../db/schema';
import { authMiddleware, requireRole } from '../middleware/auth';
import { env } from '../env';
import type { Context, Next } from 'hono';

export const leadRoutes = new Hono();
export const adminLeadRoutes = new Hono();

/**
 * Shared-secret gate for the intake endpoint.
 *
 * Fails closed: if LEAD_INTAKE_API_KEY is unset in production, every request
 * is rejected rather than silently accepting unauthenticated traffic. In
 * development an unset key is allowed through so the site can be run locally
 * without extra setup.
 */
async function serviceKeyMiddleware(c: Context, next: Next): Promise<void> {
  const configured = env.LEAD_INTAKE_API_KEY;

  if (!configured) {
    if (env.NODE_ENV === 'production') {
      throw new HTTPException(503, {
        message: 'Lead intake is not configured',
      });
    }
    await next();
    return;
  }

  const provided = c.req.header('x-api-key');
  if (provided !== configured) {
    throw new HTTPException(401, { message: 'Invalid service credentials' });
  }

  await next();
}

// -----------------------------------------------------------------------------
// POST /v1/leads — intake
// -----------------------------------------------------------------------------

leadRoutes.post(
  '/',
  serviceKeyMiddleware,
  zValidator('json', LeadPayloadSchema, (result, c) => {
    if (!result.success) {
      // Return field-level detail: the landing site surfaces these inline on
      // the form rather than showing a generic failure, per user_flow.md's
      // Validation Error state.
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Lead payload failed validation',
            fields: result.error.flatten().fieldErrors,
          },
        },
        400
      );
    }
  }),
  async (c) => {
    const payload = c.req.valid('json');

    // Map the three payload variants onto the single wide table. Each variant
    // contributes only the columns it actually has; the rest stay null.
    const row = {
      submissionId: payload.submissionId,
      leadType: payload.leadType,
      sourcePage: payload.sourcePage,
      submittedAt: new Date(payload.submittedAt),
      ...(payload.leadType === 'waitlist'
        ? {
            email: payload.email,
            phone: payload.phone ?? null,
            cityOrRegion: payload.cityOrRegion ?? null,
          }
        : payload.leadType === 'demo_request'
          ? {
              contactName: payload.contactName,
              email: payload.workEmail,
              companyName: payload.companyName,
              teamSize: payload.teamSize ?? null,
              message: payload.needsDescription ?? null,
            }
          : {
              contactName: payload.contactName,
              email: payload.contactEmail || null,
              phone: payload.contactPhone ?? null,
              companyName: payload.companyName,
              fleetSize: payload.fleetSize,
              message: payload.message ?? null,
            }),
    };

    // Idempotent on submissionId. A visitor who retries after a timeout that
    // actually succeeded must not generate a second lead — user_flow.md's
    // Submission Error state explicitly tells them to press Retry, so this is
    // an expected path, not a rare one.
    const [inserted] = await db
      .insert(leads)
      .values(row)
      .onConflictDoNothing({ target: leads.submissionId })
      .returning({ id: leads.id });

    if (inserted) {
      return c.json({ id: inserted.id, submissionId: payload.submissionId, status: 'received' }, 201);
    }

    // Conflict means we already hold this exact submission — report success,
    // since from the visitor's point of view their lead is safely captured.
    const [existing] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.submissionId, payload.submissionId))
      .limit(1);

    return c.json(
      { id: existing?.id, submissionId: payload.submissionId, status: 'already_received' },
      200
    );
  }
);

// -----------------------------------------------------------------------------
// Admin triage
// -----------------------------------------------------------------------------

const LeadListQuerySchema = z.object({
  leadType: z.enum(['waitlist', 'demo_request', 'partner_inquiry']).optional(),
  status: z.enum(['new', 'contacted', 'qualified', 'converted', 'rejected']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

adminLeadRoutes.get(
  '/',
  authMiddleware,
  requireRole('admin', 'super_admin'),
  zValidator('query', LeadListQuerySchema),
  async (c) => {
    const { leadType, status, limit, offset } = c.req.valid('query');

    const filters: SQL[] = [];
    if (leadType) filters.push(eq(leads.leadType, leadType));
    if (status) filters.push(eq(leads.status, status));

    const rows = await db
      .select()
      .from(leads)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(leads.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({ leads: rows, limit, offset });
  }
);

const LeadUpdateSchema = z.object({
  status: z.enum(['new', 'contacted', 'qualified', 'converted', 'rejected']).optional(),
  notes: z.string().optional(),
});

adminLeadRoutes.patch(
  '/:id',
  authMiddleware,
  requireRole('admin', 'super_admin'),
  zValidator('json', LeadUpdateSchema),
  async (c) => {
    const id = c.req.param('id');
    const updates = c.req.valid('json');

    const [updated] = await db
      .update(leads)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(leads.id, id))
      .returning();

    if (!updated) {
      throw new HTTPException(404, { message: 'Lead not found' });
    }

    return c.json({ lead: updated });
  }
);
