/**
 * Org Membership Routes
 *
 * GET    /v1/org/slots                      — List all slots for the authenticated org (admin)
 * POST   /v1/org/slots                      — Create a new empty slot + generate an invite token immediately
 * POST   /v1/org/slots/generate-token       — Generate invite token for a single existing slot
 * POST   /v1/org/slots/bulk-generate-tokens — Generate tokens for multiple slot IDs
 * POST   /v1/org/slots/bulk-export-csv      — Return CSV of tokens for given slot IDs
 * DELETE /v1/org/slots/:slotId/member       — Revoke member from slot
 * POST   /v1/org/join                       — Mobile: redeem an invite token
 * GET    /v1/org/membership                 — Mobile: get current user's org membership
 * DELETE /v1/org/membership                 — Mobile: leave org (release slot)
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth';
import {
  listSlots,
  generateToken,
  bulkGenerateTokens,
  createSlotWithToken,
  redeemToken,
  leaveOrg,
  getMembership,
} from '../services/org-membership.service';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { orgSlots, inviteTokens, organizations } from '../db/schema';

// ────────────────────────────────────────────────────────────
// Validation schemas
// ────────────────────────────────────────────────────────────

const GenerateTokenSchema = z.object({
  slotId: z.string().uuid(),
});

const BulkGenerateTokensSchema = z.object({
  slotIds: z.array(z.string().uuid()).min(1),
});

const BulkExportCsvSchema = z.object({
  slotIds: z.array(z.string().uuid()).min(1),
});

const JoinSchema = z.object({
  token: z.string().min(1),
});

// ────────────────────────────────────────────────────────────
// Routes
// ────────────────────────────────────────────────────────────

const orgMembershipRoutes = new Hono();
orgMembershipRoutes.use('*', authMiddleware);

// ── Org-admin: list / generate / revoke ──────────────────

/**
 * GET /v1/org/slots
 * List all slots for the authenticated admin's org.
 * Returns slot status, member info (if active), and the latest invite token (if pending).
 */
orgMembershipRoutes.get(
  '/slots',
  requireRole('corporate_admin', 'transport_partner', 'super_admin'),
  async (c) => {
    const user = c.get('user');

    if (!user.orgId) {
      return c.json({ error: { code: 403, message: 'No organization associated with your account' } }, 403);
    }

    const slots = await listSlots(user.orgId);
    return c.json({ slots });
  }
);

/**
 * POST /v1/org/slots
 * Create a new empty slot for the org and immediately generate a 7-day invite token for it.
 * Returns the new slot view (status: token_pending) with the token included.
 */
orgMembershipRoutes.post(
  '/slots',
  requireRole('corporate_admin', 'transport_partner', 'super_admin'),
  async (c) => {
    const user = c.get('user');

    if (!user.orgId) {
      return c.json({ error: { code: 403, message: 'No organization associated with your account' } }, 403);
    }

    const result = await createSlotWithToken(user.orgId);
    return c.json(result, 201);
  }
);

/**
 * POST /v1/org/slots/generate-token
 * Generate an invite token for a single slot.
 */
orgMembershipRoutes.post(
  '/slots/generate-token',
  requireRole('corporate_admin', 'transport_partner', 'super_admin'),
  zValidator('json', GenerateTokenSchema),
  async (c) => {
    const user = c.get('user');
    const { slotId } = c.req.valid('json');

    if (!user.orgId) {
      return c.json({ error: { code: 403, message: 'No organization associated with your account' } }, 403);
    }

    const result = await generateToken(slotId, user.orgId);
    return c.json(result, 201);
  }
);

/**
 * POST /v1/org/slots/bulk-generate-tokens
 * Generate tokens for multiple slot IDs (skips active member slots).
 */
orgMembershipRoutes.post(
  '/slots/bulk-generate-tokens',
  requireRole('corporate_admin', 'transport_partner', 'super_admin'),
  zValidator('json', BulkGenerateTokensSchema),
  async (c) => {
    const user = c.get('user');
    const { slotIds } = c.req.valid('json');

    if (!user.orgId) {
      return c.json({ error: { code: 403, message: 'No organization associated with your account' } }, 403);
    }

    // Service returns { results, skippedCount } — pass through directly.
    const data = await bulkGenerateTokens(slotIds, user.orgId);
    return c.json(data, 201);
  }
);

/**
 * POST /v1/org/slots/bulk-export-csv
 * Return CSV of tokens for given slot IDs.
 */
orgMembershipRoutes.post(
  '/slots/bulk-export-csv',
  requireRole('corporate_admin', 'transport_partner', 'super_admin'),
  zValidator('json', BulkExportCsvSchema),
  async (c) => {
    const user = c.get('user');
    const { slotIds } = c.req.valid('json');

    if (!user.orgId) {
      return c.json({ error: { code: 403, message: 'No organization associated with your account' } }, 403);
    }

    const { results } = await bulkGenerateTokens(slotIds, user.orgId);

    const csv = [
      'slot_id,token,invite_link,expires_at',
      ...results.map(
        (r) => `${r.slotId},${r.token},${r.inviteLink},${r.expiresAt}`
      ),
    ].join('\n');

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="invite-tokens.csv"',
      },
    });
  }
);

/**
 * DELETE /v1/org/slots/:slotId/member
 * Revoke a member from a slot (reset slot to empty, clear user's org membership).
 */
orgMembershipRoutes.delete(
  '/slots/:slotId/member',
  requireRole('corporate_admin', 'transport_partner', 'super_admin'),
  async (c) => {
    const user = c.get('user');
    const slotId = c.req.param('slotId');

    if (!user.orgId) {
      return c.json({ error: { code: 403, message: 'No organization associated with your account' } }, 403);
    }

    const slot = await db.query.orgSlots.findFirst({
      where: and(eq(orgSlots.id, slotId), eq(orgSlots.organizationId, user.orgId)),
    });

    if (!slot) {
      return c.json({ error: { code: 404, message: 'Slot not found' } }, 404);
    }

    if (!slot.memberUserId) {
      return c.json({ error: { code: 409, message: 'Slot has no active member' } }, 409);
    }

    await leaveOrg(slot.memberUserId);
    return c.json({ message: 'Member removed from slot' });
  }
);

// ── Mobile: join / membership ─────────────────────────────

/**
 * POST /v1/org/join/resolve
 * Preview the org behind a token without redeeming it.
 * Returns org name and type so the user can confirm before joining.
 */
orgMembershipRoutes.post('/join/resolve', zValidator('json', JoinSchema), async (c) => {
  const { token } = c.req.valid('json');

  const invite = await db.query.inviteTokens.findFirst({
    where: eq(inviteTokens.token, token),
  });

  if (!invite || invite.status !== 'active') {
    return c.json({ error: { code: 'INVALID_TOKEN', message: 'Invalid or expired invite token' } }, 404);
  }

  if (new Date(invite.expiresAt) < new Date()) {
    return c.json({ error: { code: 'TOKEN_EXPIRED', message: 'This invite token has expired' } }, 410);
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, invite.organizationId),
  });

  if (!org) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Organisation not found' } }, 404);
  }

  return c.json({
    data: {
      orgId: org.id,
      orgName: org.name,
      orgType: org.type,
    },
  });
});

/**
 * POST /v1/org/join
 * Redeem an invite token to join an organization.
 */
orgMembershipRoutes.post('/join', zValidator('json', JoinSchema), async (c) => {
  const user = c.get('user');
  const { token } = c.req.valid('json');

  const result = await redeemToken(token, user.sub);
  return c.json(result, 200);
});

/**
 * GET /v1/org/membership
 * Get current user's org membership details.
 *
 * Returns 200 { membership: null } when the user is not in any org — a missing
 * membership is a normal state, not an error.
 */
orgMembershipRoutes.get('/membership', async (c) => {
  const user = c.get('user');
  const result = await getMembership(user.sub);

  if (!result) {
    return c.json({ membership: null });
  }

  // Flatten the nested service result into the shape OrgMembership.fromJson expects.
  return c.json({
    membership: {
      orgId: result.org?.id ?? '',
      orgName: result.org?.name ?? '',
      orgType: result.org?.type ?? '',
      memberSince: result.memberSince,
    },
  });
});

/**
 * DELETE /v1/org/membership
 * Leave the current organization (releases slot).
 */
orgMembershipRoutes.delete('/membership', async (c) => {
  const user = c.get('user');
  await leaveOrg(user.sub);
  return c.json({ message: 'You have left the organization' });
});

export { orgMembershipRoutes };
