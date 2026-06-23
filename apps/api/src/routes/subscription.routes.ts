/**
 * Subscription Routes — org subscription plan management (C-20, T-20).
 *
 * Self-serve wallet billing (new primary path):
 *   GET  /v1/org/subscription              — current org subscription + wallet balance
 *   GET  /v1/org/subscription/price        — price preview (?plan=custom&slots=25)
 *   POST /v1/org/subscription/activate     — wallet-deduct and activate plan immediately
 *
 * Legacy admin-approval path (kept for backward-compat / admin override):
 *   POST /v1/org/subscription/request      — submit a plan request for admin review
 *
 * Admin-facing:
 *   GET   /v1/admin/subscriptions              — list all subscription requests
 *   PATCH /v1/admin/subscriptions/:id/approve  — approve a request
 *   PATCH /v1/admin/subscriptions/:id/reject   — reject a request
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth';
import {
  getOrgSubscription,
  getPlanPrice,
  activateSubscription,
  requestSubscriptionPlan,
  approveSubscriptionRequest,
  rejectSubscriptionRequest,
  getAllSubscriptionRequests,
  CORPORATE_PLANS,
  TRANSPORT_PLANS,
} from '../services/subscription.service';

// ── Validation schemas ───────────────────────────────────────────────────────

/** All valid plan values including 'custom'. */
const PlanEnum = z.enum(['starter', 'business', 'enterprise', 'standard', 'fleet', 'custom']);

const ActivateSubscriptionSchema = z.object({
  plan: PlanEnum,
  /**
   * Required when plan === 'custom'. Ignored for named plans.
   * Minimum 5 (validated in service layer for a clear error message).
   */
  customSlotCount: z.number().int().positive().optional(),
});

const SubscriptionRequestSchema = z.object({
  plan: z.enum(['starter', 'business', 'enterprise', 'standard', 'fleet']),
  slotCount: z.number().int().positive().optional(),
  notes: z.string().max(500).optional(),
});

const ApproveSchema = z.object({
  slotCount: z.number().int().positive().optional(),
});

const RejectSchema = z.object({
  reason: z.string().max(500).optional(),
});

// ── Org-facing routes ────────────────────────────────────────────────────────

export const orgSubscriptionRoutes = new Hono();
orgSubscriptionRoutes.use('*', authMiddleware);
orgSubscriptionRoutes.use(
  '*',
  requireRole('corporate_admin', 'transport_partner', 'admin', 'super_admin')
);

/**
 * GET /v1/org/subscription
 * Return the current org's subscription plan, slot count, wallet balance,
 * and available plan tiers. The dashboard uses this as a single-fetch for
 * the subscription page initial load.
 */
orgSubscriptionRoutes.get('/', async (c) => {
  const user = c.get('user');

  if (!user.orgId) {
    return c.json(
      { error: { code: 400, message: 'You do not belong to an organisation' } },
      400
    );
  }

  const subscription = await getOrgSubscription(user.orgId);
  const plans = subscription.orgType === 'transport_partner' ? TRANSPORT_PLANS : CORPORATE_PLANS;

  return c.json({ ...subscription, availablePlans: plans });
});

/**
 * GET /v1/org/subscription/price?plan=custom&slots=25
 * Compute the monthly price for a plan without committing anything.
 * Query params:
 *   plan  — required ('starter' | 'business' | 'enterprise' | 'standard' | 'fleet' | 'custom')
 *   slots — required when plan === 'custom'; minimum 5
 *
 * Returns { plan, slots, priceNgn, priceFormatted }.
 */
orgSubscriptionRoutes.get('/price', async (c) => {
  const user = c.get('user');
  const planParam = c.req.query('plan');
  const slotsParam = c.req.query('slots');

  if (!planParam) {
    return c.json({ error: { code: 400, message: 'Missing required query param: plan' } }, 400);
  }

  // Validate plan value
  const planParse = PlanEnum.safeParse(planParam);
  if (!planParse.success) {
    return c.json(
      { error: { code: 400, message: `Invalid plan: ${planParam}` } },
      400
    );
  }

  let customSlots: number | undefined;
  if (planParam === 'custom') {
    const slotsNum = parseInt(slotsParam ?? '', 10);
    if (isNaN(slotsNum) || slotsNum < 5) {
      return c.json(
        { error: { code: 400, message: 'Custom plan requires slots >= 5' } },
        400
      );
    }
    customSlots = slotsNum;
  }

  // We need the org type to disambiguate enterprise pricing.
  const subscription = await getOrgSubscription(user.orgId!);
  const result = getPlanPrice(planParam, subscription.orgType, customSlots);

  return c.json(result);
});

/**
 * POST /v1/org/subscription/activate
 * Self-serve wallet billing — validate wallet balance, deduct, activate plan.
 * Body: { plan, customSlotCount? }
 *
 * On success returns { org, transaction, walletBalance }.
 * On insufficient balance returns 400 with a human-readable message.
 */
orgSubscriptionRoutes.post(
  '/activate',
  zValidator('json', ActivateSubscriptionSchema),
  async (c) => {
    const user = c.get('user');
    const { plan, customSlotCount } = c.req.valid('json');

    if (!user.orgId) {
      return c.json(
        { error: { code: 400, message: 'You do not belong to an organisation' } },
        400
      );
    }

    const result = await activateSubscription({
      orgId: user.orgId,
      plan,
      customSlotCount,
    });

    return c.json(result, 200);
  }
);

/**
 * POST /v1/org/subscription/request
 * Legacy path: org admin submits a request for manual admin review.
 * Body: { plan, slotCount?, notes? }
 *
 * Kept for admin override scenarios. The primary path is /activate.
 */
orgSubscriptionRoutes.post(
  '/request',
  zValidator('json', SubscriptionRequestSchema),
  async (c) => {
    const user = c.get('user');
    const { plan, slotCount, notes } = c.req.valid('json');

    if (!user.orgId) {
      return c.json(
        { error: { code: 400, message: 'You do not belong to an organisation' } },
        400
      );
    }

    const request = await requestSubscriptionPlan({
      orgId: user.orgId,
      requestedByUserId: user.sub,
      plan,
      slotCount,
      notes,
    });

    return c.json(
      {
        request,
        message:
          'Your subscription request has been received. SafePass will activate your plan within 24 hours.',
      },
      201
    );
  }
);

// ── Admin routes ─────────────────────────────────────────────────────────────

export const adminSubscriptionRoutes = new Hono();
adminSubscriptionRoutes.use('*', authMiddleware);
adminSubscriptionRoutes.use('*', requireRole('admin', 'super_admin'));

/**
 * GET /v1/admin/subscriptions
 * List all subscription requests, optionally filtered by status.
 * Query: ?status=pending|approved|rejected|all
 */
adminSubscriptionRoutes.get('/', async (c) => {
  const status = c.req.query('status');
  const requests = await getAllSubscriptionRequests(status);
  return c.json({ requests });
});

/**
 * PATCH /v1/admin/subscriptions/:id/approve
 * Approve a subscription request — activates the plan on the org without
 * a wallet deduction (admin override path).
 * Body: { slotCount?: number }
 */
adminSubscriptionRoutes.patch(
  '/:id/approve',
  zValidator('json', ApproveSchema),
  async (c) => {
    const requestId = c.req.param('id');
    const user = c.get('user');
    const { slotCount } = c.req.valid('json');

    const updated = await approveSubscriptionRequest(requestId, {
      reviewedByUserId: user.sub,
      slotCount,
    });

    return c.json({ request: updated });
  }
);

/**
 * PATCH /v1/admin/subscriptions/:id/reject
 * Reject a subscription request.
 * Body: { reason?: string }
 */
adminSubscriptionRoutes.patch(
  '/:id/reject',
  zValidator('json', RejectSchema),
  async (c) => {
    const requestId = c.req.param('id');
    const user = c.get('user');
    const { reason } = c.req.valid('json');

    const updated = await rejectSubscriptionRequest(requestId, {
      reviewedByUserId: user.sub,
      reason,
    });

    return c.json({ request: updated });
  }
);
