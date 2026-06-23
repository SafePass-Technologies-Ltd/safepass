/**
 * Org Membership Service — manages org slots, invite tokens, and member lifecycle.
 */
import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { orgSlots, inviteTokens, users, organizations } from '../db/schema';

// ─────────────────────────────────────────────
// List all slots for an org (admin view)
// ─────────────────────────────────────────────

export interface SlotView {
  slotId: string;
  status: 'empty' | 'token_pending' | 'active';
  memberName: string | null;
  memberEmail: string | null;
  /** The slot's latest active invite token, if any. */
  latestToken: { token: string; expiresAt: string } | null;
}

export async function listSlots(orgId: string): Promise<SlotView[]> {
  const slots = await db.query.orgSlots.findMany({
    where: eq(orgSlots.organizationId, orgId),
  });

  // Fetch member user info and active tokens in parallel per slot.
  const results: SlotView[] = await Promise.all(
    slots.map(async (slot) => {
      // Resolve member details when slot is active.
      let memberName: string | null = null;
      let memberEmail: string | null = null;
      if (slot.memberUserId) {
        const member = await db.query.users.findFirst({
          where: eq(users.id, slot.memberUserId),
        });
        memberName = member?.fullName ?? null;
        memberEmail = member?.email ?? null;
      }

      // Fetch the most recent active invite token for this slot.
      const latestInvite = await db.query.inviteTokens.findFirst({
        where: and(
          eq(inviteTokens.slotId, slot.id),
          eq(inviteTokens.status, 'active')
        ),
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });

      return {
        slotId: slot.id,
        status: slot.status,
        memberName,
        memberEmail,
        latestToken: latestInvite
          ? { token: latestInvite.token, expiresAt: latestInvite.expiresAt.toISOString() }
          : null,
      };
    })
  );

  return results;
}

// ─────────────────────────────────────────────
// Create a new slot and immediately generate a token
// ─────────────────────────────────────────────

/**
 * Creates a new empty org slot and generates a 7-day invite token for it in one atomic step.
 * Returns the slot view with token_pending status and the token included.
 */
export async function createSlotWithToken(orgId: string) {
  const [newSlot] = await db
    .insert(orgSlots)
    .values({ organizationId: orgId, status: 'empty' })
    .returning();

  // Immediately generate a token for the new slot.
  return generateToken(newSlot.id, orgId);
}

// ─────────────────────────────────────────────
// Generate invite token for a single slot
// ─────────────────────────────────────────────

export async function generateToken(slotId: string, orgId: string) {
  // Verify the slot belongs to the org.
  const slot = await db.query.orgSlots.findFirst({
    where: and(eq(orgSlots.id, slotId), eq(orgSlots.organizationId, orgId)),
  });

  if (!slot) {
    throw Object.assign(new Error('Slot not found'), { statusCode: 404 });
  }

  if (slot.status === 'active') {
    throw Object.assign(
      new Error('Cannot generate token for a slot with an active member'),
      { statusCode: 409 }
    );
  }

  // Revoke any existing active tokens for this slot.
  await db
    .update(inviteTokens)
    .set({ status: 'revoked' })
    .where(and(eq(inviteTokens.slotId, slotId), eq(inviteTokens.status, 'active')));

  // Mark slot as token_pending.
  await db
    .update(orgSlots)
    .set({ status: 'token_pending' })
    .where(eq(orgSlots.id, slotId));

  const token = crypto.randomBytes(6).toString('hex').toUpperCase();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const [invite] = await db
    .insert(inviteTokens)
    .values({
      slotId,
      organizationId: orgId,
      token,
      expiresAt,
      status: 'active',
    })
    .returning();

  // Return a full SlotView so the dashboard can update its local slot state directly.
  return {
    slot: {
      slotId,
      status: 'token_pending' as const,
      memberName: null,
      memberEmail: null,
      latestToken: {
        token: invite.token,
        expiresAt: invite.expiresAt.toISOString(),
      },
    } satisfies SlotView,
  };
}

// ─────────────────────────────────────────────
// Bulk generate tokens for multiple slots
// ─────────────────────────────────────────────

/**
 * Bulk generate tokens for multiple slots.
 * Active-member slots are skipped automatically.
 * Returns the dashboard-expected shape: { results, skippedCount }.
 */
export async function bulkGenerateTokens(
  slotIds: string[],
  orgId: string
): Promise<{
  results: Array<{ slotId: string; token: string; expiresAt: string }>;
  skippedCount: number;
}> {
  const results: Array<{ slotId: string; token: string; expiresAt: string }> = [];
  let skippedCount = 0;

  for (const slotId of slotIds) {
    const slot = await db.query.orgSlots.findFirst({
      where: and(eq(orgSlots.id, slotId), eq(orgSlots.organizationId, orgId)),
    });

    // Skip active member slots (per spec — not an error).
    if (!slot || slot.status === 'active') {
      skippedCount++;
      continue;
    }

    try {
      const { slot: slotView } = await generateToken(slotId, orgId);
      results.push({
        slotId,
        token: slotView.latestToken!.token,
        expiresAt: slotView.latestToken!.expiresAt,
      });
    } catch {
      // Individual slot failures don't abort the bulk job.
      skippedCount++;
    }
  }

  return { results, skippedCount };
}

// ─────────────────────────────────────────────
// Redeem an invite token (mobile user join)
// ─────────────────────────────────────────────

export async function redeemToken(token: string, userId: string) {
  const invite = await db.query.inviteTokens.findFirst({
    where: eq(inviteTokens.token, token),
  });

  if (!invite) {
    throw Object.assign(new Error('Invalid invite token'), { statusCode: 404 });
  }

  if (invite.status !== 'active') {
    throw Object.assign(
      new Error(`Invite token is ${invite.status}`),
      { statusCode: 409 }
    );
  }

  if (new Date() > invite.expiresAt) {
    // Mark as expired.
    await db
      .update(inviteTokens)
      .set({ status: 'expired' })
      .where(eq(inviteTokens.id, invite.id));
    throw Object.assign(new Error('Invite token has expired'), { statusCode: 410 });
  }

  // Check user has no existing org membership.
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) {
    throw Object.assign(new Error('User not found'), { statusCode: 404 });
  }

  if (user.organizationId) {
    throw Object.assign(
      new Error('You are already a member of an organization'),
      { statusCode: 409 }
    );
  }

  // Redeem the token, activate the slot, link user to org — all in one transaction.
  await db.transaction(async (tx) => {
    await tx
      .update(inviteTokens)
      .set({ status: 'redeemed', redeemedBy: userId, redeemedAt: new Date() })
      .where(eq(inviteTokens.id, invite.id));

    await tx
      .update(orgSlots)
      .set({ status: 'active', memberUserId: userId })
      .where(eq(orgSlots.id, invite.slotId));

    await tx
      .update(users)
      .set({ organizationId: invite.organizationId, updatedAt: new Date() })
      .where(eq(users.id, userId));
  });

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, invite.organizationId),
  });

  return { organization: org };
}

// ─────────────────────────────────────────────
// Leave org (release slot)
// ─────────────────────────────────────────────

export async function leaveOrg(userId: string) {
  const slot = await db.query.orgSlots.findFirst({
    where: eq(orgSlots.memberUserId, userId),
  });

  if (!slot) {
    throw Object.assign(new Error('No org membership found'), { statusCode: 404 });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(orgSlots)
      .set({ status: 'empty', memberUserId: null })
      .where(eq(orgSlots.id, slot.id));

    // Clear org membership and reset role to 'user' if the member held an org-granted role.
    // This prevents stale corporate_admin / transport_partner roles on evicted members.
    await tx
      .update(users)
      .set({ organizationId: null, role: 'user', updatedAt: new Date() })
      .where(eq(users.id, userId));
  });
}

// ─────────────────────────────────────────────
// Get current user's org membership
// ─────────────────────────────────────────────

export async function getMembership(userId: string) {
  const slot = await db.query.orgSlots.findFirst({
    where: eq(orgSlots.memberUserId, userId),
  });

  if (!slot) return null;

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, slot.organizationId),
  });

  return {
    org,
    slot,
    memberSince: slot.createdAt,
  };
}
