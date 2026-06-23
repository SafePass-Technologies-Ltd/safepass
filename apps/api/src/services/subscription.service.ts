/**
 * Subscription Service — org subscription plan management (C-20, T-20).
 *
 * Two flows exist:
 *
 * 1. Self-serve wallet billing (new, MVP per updated docs):
 *    - Org admin selects a named plan or a Custom plan with a slot count.
 *    - System validates org wallet balance, deducts the fee, and activates
 *      the plan immediately — no admin approval step.
 *    - Entry points: `activateSubscription`, `getPlanPrice`.
 *
 * 2. Legacy admin-approval flow (kept for backward-compat / admin override):
 *    - `requestSubscriptionPlan` → `approveSubscriptionRequest` / `rejectSubscriptionRequest`.
 *    - These routes remain available but are no longer the primary path.
 */
import { v4 as uuidv4 } from 'uuid';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { organizations, orgSlots, subscriptionRequests, wallets, walletTransactions } from '../db/schema';
import { getWallet } from './wallet.service';

// ── Plan definitions (mirrors monetization.md) ──────────────────────────────

export interface PlanTier {
  plan: string;
  label: string;
  monthlyNgn: number;
  slots: number;
  description: string;
}

/**
 * Named plan tiers for corporate orgs (Starter / Business / Enterprise).
 * Prices are intentionally below what the Custom algorithm yields for the same
 * slot count — this is the commercial incentive to choose a named plan.
 */
export const CORPORATE_PLANS: PlanTier[] = [
  {
    plan: 'starter',
    label: 'Starter',
    monthlyNgn: 50_000,
    slots: 20,
    description: 'Up to 20 member slots. Unlimited trips, invite token management, basic reports.',
  },
  {
    plan: 'business',
    label: 'Business',
    monthlyNgn: 120_000,
    slots: 50,
    description: 'Up to 50 member slots. CSV/PDF export, custom alert rules.',
  },
  {
    plan: 'enterprise',
    label: 'Enterprise',
    monthlyNgn: 500_000,
    slots: 200,
    description: 'Up to 200 member slots. API access, SLA, dedicated account manager, risk analytics.',
  },
];

/**
 * Named plan tiers for transport partner orgs (Standard / Fleet / Enterprise).
 */
export const TRANSPORT_PLANS: PlanTier[] = [
  {
    plan: 'standard',
    label: 'Standard',
    monthlyNgn: 30_000,
    slots: 10,
    description: 'Up to 10 member slots. Unlimited trip monitoring, vehicle & driver management.',
  },
  {
    plan: 'fleet',
    label: 'Fleet',
    monthlyNgn: 100_000,
    slots: 30,
    description: 'Up to 30 member slots. Driver performance analytics, safety reports.',
  },
  {
    plan: 'enterprise',
    label: 'Enterprise',
    monthlyNgn: 250_000,
    slots: 150,
    description: 'Up to 150 member slots. API access, vehicle verification badge, unlimited vehicles.',
  },
];

// All named plans as a flat lookup by plan key.
const ALL_NAMED_PLANS: Record<string, { priceNgn: number; slots: number }> = {
  starter:    { priceNgn: 50_000,  slots: 20 },
  business:   { priceNgn: 120_000, slots: 50 },
  enterprise: { priceNgn: 500_000, slots: 200 }, // corporate enterprise
  standard:   { priceNgn: 30_000,  slots: 10 },
  fleet:      { priceNgn: 100_000, slots: 30 },
  // transport enterprise shares the 'enterprise' key — resolved differently by org type
};

// Transport enterprise differs from corporate enterprise in price and slot count.
const TRANSPORT_ENTERPRISE = { priceNgn: 250_000, slots: 150 };

// ── Custom plan pricing algorithm ────────────────────────────────────────────
//
// Tiered per-slot rates from monetization.md. Stored as a const so they are
// easy to locate when future config-driven overrides are added.
//
// The tier applies to the FULL slot count (non-marginal / bracket pricing).

const CUSTOM_TIERS = [
  { minSlots: 100, ratePerSlot: 2_500 },
  { minSlots: 50,  ratePerSlot: 3_000 },
  { minSlots: 20,  ratePerSlot: 3_500 },
  { minSlots: 5,   ratePerSlot: 4_000 },
] as const;

/**
 * Calculate the monthly fee for a Custom plan given a slot count.
 *
 * Uses bracket (non-marginal) pricing: the per-slot rate for the bracket
 * that contains the total slot count applies to ALL slots.
 *
 * @param slotCount - Number of member slots requested. Must be >= 5.
 * @returns Total monthly fee in NGN.
 */
export function calculateCustomPlanPrice(slotCount: number): number {
  if (slotCount < 5) {
    throw Object.assign(
      new Error('Custom plan requires a minimum of 5 slots'),
      { statusCode: 400 }
    );
  }
  const tier = CUSTOM_TIERS.find((t) => slotCount >= t.minSlots);
  // CUSTOM_TIERS is ordered descending by minSlots; last entry always matches (>= 5).
  return slotCount * tier!.ratePerSlot;
}

/**
 * Format a Naira amount for display, e.g. 87500 → "₦87,500".
 */
function formatNgn(amount: number): string {
  return `₦${amount.toLocaleString('en-NG')}`;
}

// ── Price preview ─────────────────────────────────────────────────────────────

export interface PlanPriceResult {
  plan: string;
  slots: number;
  priceNgn: number;
  priceFormatted: string;
}

/**
 * Compute price and slot count for any plan without touching the DB.
 * Used by the price-preview endpoint so the dashboard can show cost before
 * the admin confirms activation.
 *
 * @param plan        - Plan identifier (named or 'custom').
 * @param orgType     - 'corporate' | 'transport_partner' (disambiguates enterprise price).
 * @param customSlots - Required when plan === 'custom'.
 */
export function getPlanPrice(
  plan: string,
  orgType: 'corporate' | 'transport_partner',
  customSlots?: number
): PlanPriceResult {
  if (plan === 'custom') {
    if (!customSlots || customSlots < 5) {
      throw Object.assign(
        new Error('Custom plan requires slots >= 5'),
        { statusCode: 400 }
      );
    }
    const price = calculateCustomPlanPrice(customSlots);
    return {
      plan: 'custom',
      slots: customSlots,
      priceNgn: price,
      priceFormatted: formatNgn(price),
    };
  }

  // Transport enterprise has different pricing from corporate enterprise.
  if (plan === 'enterprise' && orgType === 'transport_partner') {
    return {
      plan: 'enterprise',
      slots: TRANSPORT_ENTERPRISE.slots,
      priceNgn: TRANSPORT_ENTERPRISE.priceNgn,
      priceFormatted: formatNgn(TRANSPORT_ENTERPRISE.priceNgn),
    };
  }

  const named = ALL_NAMED_PLANS[plan];
  if (!named) {
    throw Object.assign(
      new Error(`Unknown plan: ${plan}`),
      { statusCode: 400 }
    );
  }

  return {
    plan,
    slots: named.slots,
    priceNgn: named.priceNgn,
    priceFormatted: formatNgn(named.priceNgn),
  };
}

// ── Self-serve wallet activation (new, C-20 / T-20) ──────────────────────────

export interface ActivateSubscriptionInput {
  orgId: string;
  plan: string;
  /** Required when plan === 'custom'. Must be >= 5. */
  customSlotCount?: number;
}

export interface ActivateSubscriptionResult {
  org: {
    id: string;
    name: string;
    type: string;
    subscriptionPlan: string;
    slotCount: number;
    customSlotCount: number | null;
  };
  transaction: {
    id: string;
    amount: number;
    description: string;
    balanceBefore: number;
    balanceAfter: number;
  };
  walletBalance: number;
}

/**
 * Activate (or change) an org subscription plan via wallet deduction.
 *
 * Steps:
 *   1. Validate input — custom plan requires slotCount >= 5.
 *   2. Resolve pricing for the selected plan.
 *   3. Load the org's wallet and check balance.
 *   4. If insufficient, throw a 400 with the shortfall amount.
 *   5. In a DB transaction:
 *      a. Deduct price from wallet.
 *      b. Log a WalletTransaction (type: subscription_charge).
 *      c. Update org: subscription_plan, slot_count, custom_slot_count.
 *      d. Top-up OrgSlot rows to match new slot count (never delete slots
 *         with active members when decreasing).
 *   6. Return updated org + new wallet balance.
 */
export async function activateSubscription(
  input: ActivateSubscriptionInput
): Promise<ActivateSubscriptionResult> {
  // ── 1. Load org ──────────────────────────────────────────────────────────
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, input.orgId),
  });

  if (!org) {
    throw Object.assign(new Error('Organization not found'), { statusCode: 404 });
  }

  // ── 2. Resolve pricing ───────────────────────────────────────────────────
  if (input.plan === 'custom') {
    if (!input.customSlotCount || input.customSlotCount < 5) {
      throw Object.assign(
        new Error('Custom plan requires a slot count of at least 5'),
        { statusCode: 400 }
      );
    }
  }

  const pricing = getPlanPrice(input.plan, org.type, input.customSlotCount);

  // ── 3. Load wallet ───────────────────────────────────────────────────────
  const wallet = await getWallet('organization', input.orgId);
  if (!wallet) {
    throw Object.assign(
      new Error('Organisation wallet not found. Please contact support.'),
      { statusCode: 404 }
    );
  }

  if (!wallet.isActive) {
    throw Object.assign(
      new Error('Organisation wallet is frozen. Contact support.'),
      { statusCode: 403 }
    );
  }

  // ── 4. Balance check ─────────────────────────────────────────────────────
  if (wallet.balance < pricing.priceNgn) {
    const shortfall = pricing.priceNgn - wallet.balance;
    throw Object.assign(
      new Error(
        `Insufficient wallet balance. Required: ${formatNgn(pricing.priceNgn)}, ` +
        `Available: ${formatNgn(wallet.balance)}. ` +
        `Please top up ${formatNgn(shortfall)} to activate this plan.`
      ),
      { statusCode: 400, code: 'INSUFFICIENT_BALANCE' }
    );
  }

  const balanceBefore = wallet.balance;
  const balanceAfter = balanceBefore - pricing.priceNgn;
  const txDescription = `${
    input.plan.charAt(0).toUpperCase() + input.plan.slice(1)
  } plan subscription — ${pricing.slots} slots`;

  // ── 5. DB transaction ────────────────────────────────────────────────────
  let txId = '';

  await db.transaction(async (tx) => {
    // a. Deduct from wallet
    await tx
      .update(wallets)
      .set({ balance: balanceAfter, updatedAt: new Date() })
      .where(eq(wallets.id, wallet.id));

    // b. Log WalletTransaction
    const [txRow] = await tx
      .insert(walletTransactions)
      .values({
        id: uuidv4(),
        walletId: wallet.id,
        transactionType: 'subscription_charge',
        amount: -pricing.priceNgn,
        balanceBefore,
        balanceAfter,
        description: txDescription,
        status: 'completed',
        metadata: {
          plan: input.plan,
          slots: pricing.slots,
          customSlotCount: input.customSlotCount ?? null,
        },
      })
      .returning();

    txId = txRow.id;

    // c. Update org subscription fields
    await tx
      .update(organizations)
      .set({
        subscriptionPlan: input.plan as typeof org.subscriptionPlan,
        slotCount: pricing.slots,
        customSlotCount: input.plan === 'custom' ? (input.customSlotCount ?? null) : null,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, input.orgId));

    // d. Sync OrgSlot rows
    //    Count existing slots and add any deficit. Never remove slots that have
    //    active members — only empty slots are removed when decreasing.
    const existingSlots = await tx.query.orgSlots.findMany({
      where: eq(orgSlots.organizationId, input.orgId),
    });

    const currentCount = existingSlots.length;
    const targetCount = pricing.slots;

    if (targetCount > currentCount) {
      // Add the deficit as empty slots
      const newSlots = Array.from({ length: targetCount - currentCount }, () => ({
        id: uuidv4(),
        organizationId: input.orgId,
        status: 'empty' as const,
        memberUserId: null,
      }));
      await tx.insert(orgSlots).values(newSlots);
    } else if (targetCount < currentCount) {
      // Remove empty slots only (never evict active members)
      const emptySlots = existingSlots
        .filter((s) => s.status === 'empty')
        .slice(0, currentCount - targetCount);

      for (const slot of emptySlots) {
        await tx.delete(orgSlots).where(eq(orgSlots.id, slot.id));
      }
    }
  });

  // ── 6. Return result ─────────────────────────────────────────────────────
  return {
    org: {
      id: org.id,
      name: org.name,
      type: org.type,
      subscriptionPlan: input.plan,
      slotCount: pricing.slots,
      customSlotCount: input.plan === 'custom' ? (input.customSlotCount ?? null) : null,
    },
    transaction: {
      id: txId,
      amount: pricing.priceNgn,
      description: txDescription,
      balanceBefore,
      balanceAfter,
    },
    walletBalance: balanceAfter,
  };
}

// ── Read ─────────────────────────────────────────────────────────────────────

/**
 * Return the current subscription details for an org, including the org wallet
 * balance and available plan tiers. Used by the subscription page on load.
 */
export async function getOrgSubscription(orgId: string) {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: {
      id: true,
      name: true,
      type: true,
      subscriptionPlan: true,
      slotCount: true,
      customSlotCount: true,
    },
  });

  if (!org) {
    throw Object.assign(new Error('Organization not found'), { statusCode: 404 });
  }

  // Fetch wallet balance so the dashboard can display it alongside plan selection.
  const wallet = await getWallet('organization', orgId);

  // Also surface any outstanding legacy admin-approval request (pending state).
  const pendingRequest = await db.query.subscriptionRequests.findFirst({
    where: eq(subscriptionRequests.orgId, orgId),
    orderBy: desc(subscriptionRequests.createdAt),
  });

  const status =
    org.subscriptionPlan !== 'none'
      ? 'active'
      : pendingRequest?.status === 'pending'
        ? 'pending'
        : 'none';

  return {
    orgId: org.id,
    orgName: org.name,
    orgType: org.type,
    subscriptionPlan: org.subscriptionPlan,
    slotCount: org.slotCount,
    customSlotCount: org.customSlotCount ?? null,
    status,
    walletBalance: wallet?.balance ?? 0,
    walletBalanceFormatted: formatNgn(wallet?.balance ?? 0),
    pendingRequest: pendingRequest ?? null,
  };
}

// ── Legacy admin-approval flow (kept for backward-compat) ────────────────────

export interface SubscriptionRequestInput {
  orgId: string;
  requestedByUserId: string;
  plan: string;
  slotCount?: number;
  notes?: string;
}

/**
 * Submit a subscription plan request from an org admin (legacy admin-approval path).
 *
 * Creates a subscription_requests row with status='pending'. Replaced by
 * `activateSubscription` for the self-serve wallet billing flow, but retained
 * for admin override scenarios.
 */
export async function requestSubscriptionPlan(
  input: SubscriptionRequestInput
): Promise<typeof subscriptionRequests.$inferSelect> {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, input.orgId),
  });

  if (!org) {
    throw Object.assign(new Error('Organization not found'), { statusCode: 404 });
  }

  const allPlans = [...CORPORATE_PLANS, ...TRANSPORT_PLANS];
  const tier = allPlans.find((p) => p.plan === input.plan);
  const resolvedSlotCount = input.slotCount ?? tier?.slots ?? 0;

  // Cancel any previous pending requests to keep at most one live at a time.
  await db
    .update(subscriptionRequests)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(subscriptionRequests.orgId, input.orgId));

  const [request] = await db
    .insert(subscriptionRequests)
    .values({
      id: uuidv4(),
      orgId: input.orgId,
      requestedByUserId: input.requestedByUserId,
      requestedPlan: input.plan as typeof subscriptionRequests.$inferSelect['requestedPlan'],
      requestedSlotCount: resolvedSlotCount,
      notes: input.notes ?? null,
      status: 'pending',
    })
    .returning();

  return request;
}

export interface SubscriptionApprovalInput {
  reviewedByUserId: string;
  slotCount?: number;
}

/**
 * Admin approves a subscription request — activates the plan on the org
 * without a wallet deduction (admin-approval path, not the self-serve flow).
 */
export async function approveSubscriptionRequest(
  requestId: string,
  input: SubscriptionApprovalInput
): Promise<typeof subscriptionRequests.$inferSelect> {
  const request = await db.query.subscriptionRequests.findFirst({
    where: eq(subscriptionRequests.id, requestId),
  });

  if (!request) {
    throw Object.assign(new Error('Subscription request not found'), { statusCode: 404 });
  }

  if (request.status !== 'pending') {
    throw Object.assign(
      new Error(`Request is already ${request.status} and cannot be approved`),
      { statusCode: 409 }
    );
  }

  const finalSlotCount = input.slotCount ?? request.requestedSlotCount;

  await db
    .update(organizations)
    .set({
      subscriptionPlan: request.requestedPlan,
      slotCount: finalSlotCount,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, request.orgId));

  const [updated] = await db
    .update(subscriptionRequests)
    .set({
      status: 'approved',
      reviewedByUserId: input.reviewedByUserId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscriptionRequests.id, requestId))
    .returning();

  return updated;
}

/**
 * Admin rejects a subscription request. The org's plan is unchanged.
 */
export async function rejectSubscriptionRequest(
  requestId: string,
  input: { reviewedByUserId: string; reason?: string }
): Promise<typeof subscriptionRequests.$inferSelect> {
  const request = await db.query.subscriptionRequests.findFirst({
    where: eq(subscriptionRequests.id, requestId),
  });

  if (!request) {
    throw Object.assign(new Error('Subscription request not found'), { statusCode: 404 });
  }

  if (request.status !== 'pending') {
    throw Object.assign(
      new Error(`Request is already ${request.status} and cannot be rejected`),
      { statusCode: 409 }
    );
  }

  const [updated] = await db
    .update(subscriptionRequests)
    .set({
      status: 'rejected',
      reviewedByUserId: input.reviewedByUserId,
      reviewedAt: new Date(),
      notes: input.reason ?? request.notes,
      updatedAt: new Date(),
    })
    .where(eq(subscriptionRequests.id, requestId))
    .returning();

  return updated;
}

/**
 * List all subscription requests — admin view.
 * Optionally filter by status ('pending' | 'approved' | 'rejected' | 'all').
 */
export async function getAllSubscriptionRequests(status?: string) {
  const allRequests = await db.query.subscriptionRequests.findMany({
    orderBy: desc(subscriptionRequests.createdAt),
  });

  const filtered =
    !status || status === 'all'
      ? allRequests
      : allRequests.filter((r) => r.status === status);

  const orgIds = [...new Set(filtered.map((r) => r.orgId))];
  const orgsRaw = await Promise.all(
    orgIds.map((id) =>
      db.query.organizations.findFirst({
        where: eq(organizations.id, id),
        columns: { id: true, name: true, type: true },
      })
    )
  );
  const orgsMap = Object.fromEntries(
    orgsRaw.filter(Boolean).map((o) => [o!.id, o])
  );

  return filtered.map((r) => ({
    ...r,
    org: orgsMap[r.orgId] ?? null,
  }));
}
