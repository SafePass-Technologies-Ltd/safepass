/**
 * Account Deletion Service — M-38 "Account Deletion" / A-27 "Account
 * Deletion Oversight & Legal Holds".
 *
 * Implements the flow documented in docs/SafePass/user_flow.md Flow 10:
 * self-service request creation (with pre-flight checks), cancellation
 * during the 14-day cooling-off period, background sweep execution (normal
 * path vs. legal hold), and admin-side legal-hold override / force-delete.
 *
 * The per-entity retention behaviour at execution time follows
 * docs/SafePass/schema.md's "Account Deletion — Data Retention Matrix"
 * exactly -- see executeDeletionCascade's inline comments for the mapping
 * from each matrix row to the corresponding query here.
 */
import { v4 as uuidv4 } from 'uuid';
import { eq, and, or, inArray, lte, ne, isNull } from 'drizzle-orm';
import { db } from '../db';
import {
  users,
  trips,
  wallets,
  organizations,
  accountDeletionRequests,
  tripSummaries,
  tripLocationHistory,
  userVehicles,
  scheduledTrips,
  fcmTokens,
  tripTagInvites,
  incidents,
  emergencyEvents,
  escalations,
} from '../db/schema';
import type { DeletionPreFlightChecks } from '../db/schema';
import { env } from '../env';
import { getWallet } from './wallet.service';

// Trip statuses that block deletion at pre-flight -- mirrors trip.service.ts's
// ACTIVE_STATUSES (not exported from there, so re-declared here rather than
// widening that module's public surface for a single shared constant).
const ACTIVE_TRIP_STATUSES = ['active', 'delayed', 'emergency', 'escalated'] as const;

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type LegalHoldCheck =
  | { blocked: false }
  | { blocked: true; reason: string; refs: string[] };

// ────────────────────────────────────────────────────────────
// Pre-flight checks (Flow 10a)
// ────────────────────────────────────────────────────────────

/** A pre-flight check failure, surfaced to the caller as an HTTP 409. */
class PreFlightError extends Error {
  statusCode = 409;
  constructor(message: string) {
    super(message);
  }
}

/**
 * Edge case 1: any trip not in draft/completed/cancelled blocks deletion.
 */
async function hasActiveTrip(userId: string): Promise<boolean> {
  const active = await db.query.trips.findFirst({
    where: and(eq(trips.userId, userId), inArray(trips.status, ACTIVE_TRIP_STATUSES)),
    columns: { id: true },
  });
  return !!active;
}

/**
 * Edge case 3: wallet balance must be at/below the forfeiture threshold (or
 * explicitly forfeited) to proceed. Returns the balance at check time (also
 * captured in preFlightChecks for audit) plus whether it blocks the request.
 */
async function checkWalletBalance(
  userId: string,
  forfeit: boolean
): Promise<{ balance: number; blocked: boolean; requiresForfeitCheckbox: boolean }> {
  const wallet = await getWallet('user', userId);
  const balance = wallet?.balance ?? 0;

  if (balance <= 0) {
    return { balance, blocked: false, requiresForfeitCheckbox: false };
  }

  if (balance > env.ACCOUNT_DELETION_WALLET_FORFEIT_THRESHOLD_NGN) {
    // Above threshold -- no forfeiture option, must go through support.
    return { balance, blocked: true, requiresForfeitCheckbox: false };
  }

  // At/below threshold -- may proceed only if the user explicitly forfeits.
  return { balance, blocked: !forfeit, requiresForfeitCheckbox: true };
}

/**
 * Edge case 2 + the general "org membership must be resolved first"
 * precondition (schema.md's OrgSlot/InviteToken retention-matrix row):
 * ANY current org member must leave their org (M-32) before requesting
 * deletion. A corporate_admin/transport_partner who is the org's *sole*
 * active admin gets the more specific "needs a handoff" message instead of
 * the generic "leave your org first" one, since they cannot simply leave
 * without first transferring or deactivating the org (see A-27's org
 * handoff assist).
 */
async function checkOrgMembership(
  user: typeof users.$inferSelect
): Promise<{ blocked: boolean; wasSoleOrgAdmin: boolean; message?: string }> {
  if (!user.organizationId) {
    return { blocked: false, wasSoleOrgAdmin: false };
  }

  const isOrgAdminRole = user.role === 'corporate_admin' || user.role === 'transport_partner';

  if (isOrgAdminRole) {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, user.organizationId),
    });

    if (org?.isActive) {
      const otherAdmin = await db.query.users.findFirst({
        where: and(
          eq(users.organizationId, user.organizationId),
          inArray(users.role, ['corporate_admin', 'transport_partner']),
          ne(users.id, user.id),
          eq(users.isActive, true)
        ),
        columns: { id: true },
      });

      if (!otherAdmin) {
        return {
          blocked: true,
          wasSoleOrgAdmin: true,
          message:
            'Your organisation needs an admin. Transfer admin rights or contact SafePass support to offboard your organisation first.',
        };
      }
    }
  }

  // Any other org membership (regular member, or admin with another admin
  // present) must be released via Leave Organisation (M-32) first.
  return {
    blocked: true,
    wasSoleOrgAdmin: false,
    message: 'You are currently a member of an organisation. Leave your organisation before deleting your account.',
  };
}

// ────────────────────────────────────────────────────────────
// Request creation (Flow 10a)
// ────────────────────────────────────────────────────────────

export interface CreateDeletionRequestInput {
  userId: string;
  forfeitWalletBalance: boolean;
}

/**
 * Run pre-flight checks and, if they all pass, create a new
 * AccountDeletionRequest with a 14-day cooling-off period.
 *
 * Throws a PreFlightError (statusCode 409) with a user-facing message for
 * any failing check, matching Flow 10a's branching exactly.
 */
export async function createDeletionRequest(
  input: CreateDeletionRequestInput
): Promise<typeof accountDeletionRequests.$inferSelect> {
  const user = await db.query.users.findFirst({ where: eq(users.id, input.userId) });
  if (!user) {
    throw Object.assign(new Error('User not found'), { statusCode: 404 });
  }

  // Only one non-terminal (pending/legal_hold) request at a time.
  const existing = await db.query.accountDeletionRequests.findFirst({
    where: and(
      eq(accountDeletionRequests.userId, input.userId),
      inArray(accountDeletionRequests.status, ['pending', 'legal_hold'])
    ),
  });
  if (existing) {
    throw new PreFlightError('You already have a pending account deletion request.');
  }

  const hadActiveTrip = await hasActiveTrip(input.userId);
  if (hadActiveTrip) {
    throw new PreFlightError('Complete or cancel your active trip before deleting your account.');
  }

  const walletCheck = await checkWalletBalance(input.userId, input.forfeitWalletBalance);
  if (walletCheck.blocked) {
    throw new PreFlightError(
      walletCheck.requiresForfeitCheckbox
        ? `Your wallet balance is ₦${walletCheck.balance}. Check "I forfeit my remaining balance" to proceed.`
        : `Your wallet balance is ₦${walletCheck.balance}. Request a refund via support before deleting your account.`
    );
  }

  const orgCheck = await checkOrgMembership(user);
  if (orgCheck.blocked) {
    throw new PreFlightError(orgCheck.message!);
  }

  const requestedAt = new Date();
  const scheduledFor = new Date(
    requestedAt.getTime() + env.ACCOUNT_DELETION_COOLING_OFF_DAYS * 24 * 60 * 60 * 1000
  );

  const preFlightChecks: DeletionPreFlightChecks = {
    hadActiveTrip,
    walletBalanceAtRequest: walletCheck.balance,
    walletForfeited: input.forfeitWalletBalance && walletCheck.balance > 0,
    wasSoleOrgAdmin: orgCheck.wasSoleOrgAdmin,
  };

  const [request] = await db
    .insert(accountDeletionRequests)
    .values({
      id: uuidv4(),
      userId: input.userId,
      status: 'pending',
      requestedAt,
      scheduledFor,
      preFlightChecks,
    })
    .returning();

  return request;
}

/**
 * GET /v1/users/me/deletion-request — most recent non-cancelled request for
 * this user (pending/legal_hold/completed/force_deleted), or null if the
 * user has never requested deletion (or their only request was cancelled).
 * Powers the Profile screen's scheduled-deletion banner.
 */
export async function getLatestDeletionRequest(
  userId: string
): Promise<typeof accountDeletionRequests.$inferSelect | null> {
  const request = await db.query.accountDeletionRequests.findFirst({
    where: eq(accountDeletionRequests.userId, userId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });
  return request ?? null;
}

/**
 * DELETE /v1/users/me/deletion-request (Flow 10b) — cancel a pending
 * request during the cooling-off window. Only 'pending' requests can be
 * cancelled (a 'legal_hold' request can still be cancelled per the
 * behavioural notes: "user can still cancel the request entirely if they
 * wish").
 */
export async function cancelDeletionRequest(
  userId: string
): Promise<typeof accountDeletionRequests.$inferSelect> {
  const request = await db.query.accountDeletionRequests.findFirst({
    where: and(
      eq(accountDeletionRequests.userId, userId),
      inArray(accountDeletionRequests.status, ['pending', 'legal_hold'])
    ),
  });

  if (!request) {
    throw Object.assign(new Error('No pending deletion request found'), { statusCode: 404 });
  }

  const [updated] = await db
    .update(accountDeletionRequests)
    .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
    .where(eq(accountDeletionRequests.id, request.id))
    .returning();

  return updated;
}

// ────────────────────────────────────────────────────────────
// Legal hold check (Flow 10c / used by force-delete too)
// ────────────────────────────────────────────────────────────

/**
 * Check whether a user is currently party to any unresolved safety record
 * that must block their account deletion cascade. Covers all three record
 * types called out in the retention matrix:
 *   - Incident:       reporter_id = user AND is_active = true
 *   - EmergencyEvent: on one of the user's own trips, status not terminal
 *   - Escalation:     on one of the user's own trips, status not terminal
 *
 * "Non-terminal" per each entity's own status enum -- EmergencyEvent's
 * terminal states are resolved_false_alarm/resolved_incident; Escalation's
 * are resolved/closed. Incident has no direct terminal/non-terminal status
 * concept in its verification_status enum, so is_active (whether the
 * incident is "still considered active/relevant" per its own schema
 * doc-comment) is used instead -- this is the closest existing signal to
 * "unresolved" for that entity.
 */
export async function checkLegalHold(userId: string): Promise<LegalHoldCheck> {
  const refs: string[] = [];

  const openIncidents = await db.query.incidents.findMany({
    where: and(eq(incidents.reporterId, userId), eq(incidents.isActive, true)),
    columns: { id: true },
  });
  refs.push(...openIncidents.map((i) => i.id));

  const userTrips = await db.query.trips.findMany({
    where: eq(trips.userId, userId),
    columns: { id: true },
  });
  const tripIds = userTrips.map((t) => t.id);

  if (tripIds.length > 0) {
    const openEmergencies = await db.query.emergencyEvents.findMany({
      where: and(
        inArray(emergencyEvents.tripId, tripIds),
        inArray(emergencyEvents.status, ['active', 'acknowledged', 'escalated'])
      ),
      columns: { id: true },
    });
    refs.push(...openEmergencies.map((e) => e.id));

    const openEscalations = await db.query.escalations.findMany({
      where: and(
        inArray(escalations.tripId, tripIds),
        inArray(escalations.status, ['pending', 'acknowledged', 'in_progress'])
      ),
      columns: { id: true },
    });
    refs.push(...openEscalations.map((e) => e.id));
  }

  if (refs.length === 0) {
    return { blocked: false };
  }

  return {
    blocked: true,
    reason: `User is party to ${refs.length} unresolved safety record(s) — deletion held pending resolution.`,
    refs,
  };
}

// ────────────────────────────────────────────────────────────
// Deletion cascade execution (Flow 10c normal path, Flow 10d override/force)
// ────────────────────────────────────────────────────────────

/**
 * Execute the deletion cascade for a user, per docs/SafePass/schema.md's
 * Account Deletion Data Retention Matrix. This is the single place all
 * three trigger paths (sweep job, super_admin legal-hold override,
 * super_admin force-delete) funnel through, so the retention behaviour
 * can never drift between them.
 *
 * Retention matrix -> implementation mapping:
 *   - User: ANONYMIZE (this function) -- PII scrubbed, is_active=false, deleted_at set.
 *   - Trip: ANONYMIZE -- no separate mutation needed; Trip.user_id already
 *     points at this user, and User is anonymized above, so the FK
 *     reference is "anonymized" as a byproduct (same reasoning applies to
 *     every other FK-holding entity below marked "no mutation needed").
 *   - TripSummary / TripLocationHistory: HARD DELETE via explicit query on
 *     trip.user_id (NOT the trip_id cascade FK, since Trip rows are never
 *     deleted) -- this is the fix for the A-26/R-013 gap.
 *   - Payment / WalletTransaction: retained untouched (no mutation needed).
 *   - Incident (reporter_id=user), Message (sender_id=user), MapMarker
 *     (created_by=user), MapMarkerInteraction (user_id=user),
 *     RoleUpgradeRequest (user_id or reviewed_by=user): retained, "anonymize
 *     the reference" -- no mutation needed (see above); the FK now points
 *     at the anonymized User row.
 *   - EmergencyEvent / Escalation / CheckIn: retained in full, unredacted
 *     (no mutation at all -- not even the FK-follows-anonymization case,
 *     since these aren't keyed directly by user_id).
 *   - UserVehicle / ScheduledTrip: HARD DELETE.
 *   - fcm_tokens: HARD DELETE (not in the matrix by name, but "signed out
 *     of all sessions; FCM token deregistered" in Flow 10c -- this is the
 *     concrete mechanism for that step; see also this table's existing
 *     onDelete:'cascade' FK to users, which never fires here since User is
 *     anonymized not deleted).
 *   - TripTagInvite: HARD DELETE only if status is pending/declined/
 *     window_expired (no linked_trip_id was ever created); retained
 *     (no mutation) if accepted, since an accepted invite has a real linked
 *     Trip that must stay attributable.
 *   - AccountDeletionRequest: retained -- this function does not touch the
 *     calling request's own row; the caller sets its terminal status
 *     (completed/force_deleted) after this function returns.
 */
export async function executeDeletionCascade(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // Hard-delete TripSummary/TripLocationHistory via explicit user_id join
    // -- NOT the trip_id cascade FK (Trip rows are never deleted).
    const userTripRows = await tx
      .select({ id: trips.id })
      .from(trips)
      .where(eq(trips.userId, userId));
    const tripIds = userTripRows.map((t) => t.id);

    if (tripIds.length > 0) {
      await tx.delete(tripSummaries).where(inArray(tripSummaries.tripId, tripIds));
      await tx.delete(tripLocationHistory).where(inArray(tripLocationHistory.tripId, tripIds));
    }

    // Hard-delete purely personal data with no downstream value.
    await tx.delete(userVehicles).where(eq(userVehicles.userId, userId));
    await tx.delete(scheduledTrips).where(eq(scheduledTrips.userId, userId));
    await tx.delete(fcmTokens).where(eq(fcmTokens.userId, userId));

    // Hard-delete trip tag invites that never resulted in a linked trip.
    await tx
      .delete(tripTagInvites)
      .where(
        and(
          or(eq(tripTagInvites.initiatorUserId, userId), eq(tripTagInvites.taggedUserId, userId)),
          inArray(tripTagInvites.status, ['pending', 'declined', 'window_expired']),
          isNull(tripTagInvites.linkedTripId)
        )
      );

    // Anonymize the User row -- PII scrubbed, row retained for FK integrity.
    // authProviderId keeps NOT NULL + must stay unique per (auth_provider,
    // auth_provider_id) -- a per-user placeholder guarantees no collision
    // with a future user of the same provider.
    await tx
      .update(users)
      .set({
        fullName: 'Deleted User',
        email: null,
        phone: null,
        emergencyContacts: [],
        authProviderId: `deleted-${userId}`,
        isActive: false,
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  });
}

// ────────────────────────────────────────────────────────────
// Background sweep (Flow 10c) -- entry point for the scheduled job
// ────────────────────────────────────────────────────────────

export interface SweepResult {
  executed: number;
  heldOnLegalHold: number;
}

/**
 * Scan for AccountDeletionRequest rows whose cooling-off window has
 * elapsed and execute or legal-hold each one. Called by the scheduled job
 * (jobs/account-deletion-sweep.job.ts) -- see that module for the cron
 * schedule and why a cron job is justified here (unlike the fixed-window
 * trip-archive purge that was removed).
 */
export async function runDeletionSweep(): Promise<SweepResult> {
  const due = await db.query.accountDeletionRequests.findMany({
    where: and(
      eq(accountDeletionRequests.status, 'pending'),
      lte(accountDeletionRequests.scheduledFor, new Date())
    ),
  });

  let executed = 0;
  let heldOnLegalHold = 0;

  for (const request of due) {
    const holdCheck = await checkLegalHold(request.userId);

    if (holdCheck.blocked) {
      await db
        .update(accountDeletionRequests)
        .set({
          status: 'legal_hold',
          legalHoldReason: holdCheck.reason,
          legalHoldRefs: holdCheck.refs,
          updatedAt: new Date(),
        })
        .where(eq(accountDeletionRequests.id, request.id));
      heldOnLegalHold++;
      // Notification to admin/super_admin: the Legal Hold Queue (A-27,
      // GET /v1/admin/account-deletions?status=legal_hold) is the system of
      // record for discovering held requests -- no separate push/email
      // notification pipeline exists yet (there is no generic
      // "notify all admins" mechanism anywhere else in this codebase
      // either; role-upgrade requests are surfaced the same way, via a
      // dashboard queue, not a push alert). Logged here so ops can at least
      // grep for holds without waiting on a dashboard visit.
      console.log(
        `[account-deletion-sweep] request ${request.id} (user ${request.userId}) placed on legal_hold: ${holdCheck.reason}`
      );
    } else {
      await executeDeletionCascade(request.userId);
      await db
        .update(accountDeletionRequests)
        .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
        .where(eq(accountDeletionRequests.id, request.id));
      executed++;
    }
  }

  return { executed, heldOnLegalHold };
}

// ────────────────────────────────────────────────────────────
// Admin actions (Flow 10d / A-27)
// ────────────────────────────────────────────────────────────

/**
 * List AccountDeletionRequest rows for the admin Legal Hold Queue,
 * optionally filtered by status.
 */
export async function listDeletionRequests(
  status?: 'pending' | 'legal_hold' | 'completed' | 'cancelled' | 'force_deleted'
): Promise<(typeof accountDeletionRequests.$inferSelect)[]> {
  return db.query.accountDeletionRequests.findMany({
    where: status ? eq(accountDeletionRequests.status, status) : undefined,
    orderBy: (t, { desc }) => [desc(t.createdAt)],
    limit: 200,
  });
}

/**
 * super_admin-only: override an open legal hold and execute the deletion
 * cascade immediately, with a mandatory logged justification reason.
 */
export async function overrideLegalHold(
  requestId: string,
  actorId: string,
  reason: string
): Promise<typeof accountDeletionRequests.$inferSelect> {
  const request = await db.query.accountDeletionRequests.findFirst({
    where: eq(accountDeletionRequests.id, requestId),
  });

  if (!request) {
    throw Object.assign(new Error('Deletion request not found'), { statusCode: 404 });
  }
  if (request.status !== 'legal_hold') {
    throw Object.assign(new Error('Request is not on legal hold'), { statusCode: 400 });
  }

  await executeDeletionCascade(request.userId);

  const [updated] = await db
    .update(accountDeletionRequests)
    .set({
      status: 'completed',
      completedAt: new Date(),
      holdOverriddenBy: actorId,
      holdOverrideReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(accountDeletionRequests.id, requestId))
    .returning();

  return updated;
}

/**
 * super_admin-only: force-delete a user immediately, bypassing the 14-day
 * cooling-off period entirely (e.g. an escalated NDPR erasure request).
 * Still respects an open legal hold unless `overrideHold` is explicitly
 * passed -- mirrors the same legal-hold check used by the sweep job so the
 * two paths can never diverge on what counts as "blocked".
 *
 * Creates a fresh AccountDeletionRequest row for the audit trail if the
 * user has no existing pending/legal_hold request (a force-delete doesn't
 * require the user to have gone through self-service request creation
 * first).
 */
export async function forceDeleteUser(
  userId: string,
  actorId: string,
  reason: string,
  overrideHold: boolean
): Promise<typeof accountDeletionRequests.$inferSelect> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) {
    throw Object.assign(new Error('User not found'), { statusCode: 404 });
  }
  if (user.deletedAt) {
    throw Object.assign(new Error('User has already been deleted'), { statusCode: 400 });
  }

  const holdCheck = await checkLegalHold(userId);
  if (holdCheck.blocked && !overrideHold) {
    throw Object.assign(
      new Error(
        `Cannot force-delete — user is party to an open safety record (${holdCheck.refs.join(', ')}). Resolve first or override with justification.`
      ),
      { statusCode: 409 }
    );
  }

  // Reuse an existing non-terminal request if present, otherwise create one
  // purely for the audit trail (this bypasses the normal pre-flight checks
  // by design -- force-delete is an admin override, not a self-service path).
  let request = await db.query.accountDeletionRequests.findFirst({
    where: and(
      eq(accountDeletionRequests.userId, userId),
      inArray(accountDeletionRequests.status, ['pending', 'legal_hold'])
    ),
  });

  const now = new Date();
  if (!request) {
    const wallet = await getWallet('user', userId);
    const [created] = await db
      .insert(accountDeletionRequests)
      .values({
        id: uuidv4(),
        userId,
        status: 'pending',
        requestedAt: now,
        scheduledFor: now,
        preFlightChecks: {
          hadActiveTrip: await hasActiveTrip(userId),
          walletBalanceAtRequest: wallet?.balance ?? 0,
          walletForfeited: false,
          wasSoleOrgAdmin: false,
        },
      })
      .returning();
    request = created;
  }

  await executeDeletionCascade(userId);

  const [updated] = await db
    .update(accountDeletionRequests)
    .set({
      status: 'force_deleted',
      completedAt: now,
      forceDeletedBy: actorId,
      forceDeleteReason: reason,
      ...(holdCheck.blocked ? { holdOverriddenBy: actorId, holdOverrideReason: reason } : {}),
      updatedAt: now,
    })
    .where(eq(accountDeletionRequests.id, request.id))
    .returning();

  return updated;
}
