/**
 * Trip Service — manages the full trip lifecycle.
 *
 * Handles trip CRUD, status transitions, GPS ingestion, and the
 * wallet auto-deduction on trip start. Designed to be called from
 * route handlers (auth context already resolved).
 */
import { v4 as uuidv4 } from 'uuid';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { trips, wallets, walletTransactions, users, organizations, tripTagInvites, messages } from '../db/schema';
import { env } from '../env';
import type { Location } from '../db/schema/types';
import {
  broadcastGpsUpdate,
  broadcastTripStatus,
} from './websocket.service';
import { saveTripLocation } from './dynamo.service';
import { createWallet } from './wallet.service';

// ────────────────────────────────────────────────────────────
// Enum column types (for Drizzle strict enum comparisons)
// ────────────────────────────────────────────────────────────

type TripStatus = typeof trips.$inferSelect['status'];
type VehicleType = typeof trips.$inferSelect['vehicleType'];

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface TripCreateInput {
  userId: string;
  /** Who actually initiated this trip -- defaults to `userId` (self-registered,
   * the normal mobile-app case). Distinct from `userId` when a corporate_admin/
   * transport_partner/platform admin registers a trip on behalf of a staff
   * member (docs/SafePass/screens.md Screen 31 "Trip Registration
   * (Corporate)") -- `userId` is the staff member being monitored, this is
   * the admin who registered it. */
  registeredBy?: string;
  /** The caller's role from the JWT — used to auto-populate transport_company. */
  callerRole?: string;
  organizationId?: string;
  userVehicleId?: string;
  origin: Location;
  destination: Location;
  vehicleType?: string;
  vehiclePlateNumber?: string;
  vehicleDescription?: string;
  transportCompany?: string;
  driverName?: string;
  driverPhone?: string;
  routePolyline?: string;
}

export interface GpsUpdateInput {
  latitude: number;
  longitude: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
}

export interface TripFilter {
  status?: string | string[];
  limit?: number;
  offset?: number;
}

// ────────────────────────────────────────────────────────────
// Status transition rules
// ────────────────────────────────────────────────────────────

/** Valid status transitions for the trip state machine. */
const ALLOWED_TRANSITIONS: Record<string, TripStatus[]> = {
  draft: ['active', 'cancelled'],
  active: ['delayed', 'emergency', 'completed', 'cancelled', 'escalated'],
  delayed: ['active', 'emergency', 'completed', 'cancelled', 'escalated'],
  emergency: ['active', 'escalated', 'completed'],
  escalated: ['active', 'completed'],
  completed: [],   // terminal
  cancelled: [],   // terminal
};

/** Statuses that are considered "in progress" (not terminal). */
const ACTIVE_STATUSES: TripStatus[] = ['active', 'delayed', 'emergency', 'escalated'];

/** All valid trip status values. */
const ALL_STATUSES: TripStatus[] = [
  'draft', 'active', 'delayed', 'emergency',
  'escalated', 'completed', 'cancelled',
];

/**
 * Validate that a status transition is allowed.
 * Throws if the transition is invalid.
 */
function assertValidTransition(current: string, next: TripStatus): void {
  const allowed = ALLOWED_TRANSITIONS[current];
  if (!allowed || !allowed.includes(next)) {
    throw Object.assign(
      new Error(`Cannot transition from '${current}' to '${next}'`),
      { statusCode: 422 }
    );
  }
}

/**
 * Check if a status represents an active trip.
 */
function isActiveStatus(status: string): status is TripStatus {
  return (ACTIVE_STATUSES as readonly string[]).includes(status);
}

/** Narrow a string to a TripStatus, defaulting to 'draft'. */
function asTripStatus(s: string): TripStatus {
  if ((ALL_STATUSES as readonly string[]).includes(s)) return s as TripStatus;
  return 'draft';
}

/** Narrow a string to a VehicleType or null. */
function asVehicleType(v: string | undefined | null): VehicleType | null {
  if (!v) return null;
  const VALID: readonly string[] = ['car', 'bus', 'suv', 'truck', 'motorcycle', 'other'];
  return VALID.includes(v) ? (v as VehicleType) : null;
}

// ────────────────────────────────────────────────────────────
// Trip CRUD
// ────────────────────────────────────────────────────────────

/**
 * Create a new trip. Defaults to 'draft' status.
 *
 * For Transport Partner org members, transport_company is auto-populated from
 * the linked organization's name — the caller's input value is ignored for
 * that field so it cannot be spoofed client-side.
 */
export async function createTrip(
  input: TripCreateInput
): Promise<typeof trips.$inferSelect> {
  // Resolve transport company: transport_partner members always inherit their
  // organization's name regardless of what the client sends.
  let resolvedTransportCompany = input.transportCompany ?? null;
  if (input.callerRole === 'transport_partner' && input.organizationId) {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, input.organizationId),
    });
    if (org) {
      resolvedTransportCompany = org.name;
    }
  }

  const [trip] = await db
    .insert(trips)
    .values({
      id: uuidv4(),
      userId: input.userId,
      organizationId: input.organizationId ?? null,
      registeredBy: input.registeredBy ?? input.userId,
      userVehicleId: input.userVehicleId ?? null,
      origin: input.origin,
      destination: input.destination,
      status: 'draft' as TripStatus,
      vehicleType: asVehicleType(input.vehicleType),
      vehiclePlateNumber: input.vehiclePlateNumber ?? null,
      vehicleDescription: input.vehicleDescription ?? null,
      transportCompany: resolvedTransportCompany,
      driverName: input.driverName ?? null,
      driverPhone: input.driverPhone ?? null,
      routePolyline: input.routePolyline ?? null,
      paymentIds: [],
    })
    .returning();

  return trip;
}

// ────────────────────────────────────────────────────────────
// Trip field update
// ────────────────────────────────────────────────────────────

export interface TripUpdateVehicleInput {
  vehiclePlateNumber?: string | null;
  vehicleDescription?: string | null;
  transportCompany?: string | null;
}

/**
 * Update vehicle fields on a trip.
 *
 * Vehicle fields are locked once the trip leaves 'draft' status to prevent
 * retroactive alterations of vehicle records after monitoring has started.
 */
export async function updateTripVehicleFields(
  tripId: string,
  userId: string,
  input: TripUpdateVehicleInput
): Promise<typeof trips.$inferSelect> {
  const trip = await db.query.trips.findFirst({
    where: and(eq(trips.id, tripId), eq(trips.userId, userId)),
  });

  if (!trip) {
    throw Object.assign(new Error('Trip not found'), { statusCode: 404 });
  }

  if (trip.status !== 'draft') {
    throw Object.assign(
      new Error('Vehicle fields cannot be changed once a trip is active.'),
      { statusCode: 400 }
    );
  }

  const [updated] = await db
    .update(trips)
    .set({
      ...(input.vehiclePlateNumber !== undefined && { vehiclePlateNumber: input.vehiclePlateNumber }),
      ...(input.vehicleDescription !== undefined && { vehicleDescription: input.vehicleDescription }),
      ...(input.transportCompany !== undefined && { transportCompany: input.transportCompany }),
      updatedAt: new Date(),
    })
    .where(eq(trips.id, tripId))
    .returning();

  return updated;
}

// ────────────────────────────────────────────────────────────
// Trip Tag Invite
// ────────────────────────────────────────────────────────────

export interface TripTagInviteCreateInput {
  initiatorUserId: string;
  taggedUserId: string;
  organizationId: string;
  tripId: string;
  /** Expiry window for the invite (defaults to 30 minutes from now). */
  expiresInMinutes?: number;
}

/**
 * Create a TripTagInvite.
 *
 * Guard: the initiator's trip must have a vehicle_plate_number set before
 * tagging is allowed. This ensures the tagged member's copied trip always
 * carries meaningful vehicle info.
 */
export async function createTripTagInvite(
  input: TripTagInviteCreateInput
): Promise<typeof tripTagInvites.$inferSelect> {
  // Load the initiator's trip to check for vehicle plate.
  const initiatorTrip = await db.query.trips.findFirst({
    where: and(
      eq(trips.id, input.tripId),
      eq(trips.userId, input.initiatorUserId)
    ),
  });

  if (!initiatorTrip) {
    throw Object.assign(new Error('Trip not found'), { statusCode: 404 });
  }

  if (!initiatorTrip.vehiclePlateNumber) {
    throw Object.assign(
      new Error('Vehicle plate number is required before tagging members on a trip.'),
      { statusCode: 400 }
    );
  }

  const expiresAt = new Date(
    Date.now() + (input.expiresInMinutes ?? 30) * 60 * 1000
  );

  const [invite] = await db
    .insert(tripTagInvites)
    .values({
      id: uuidv4(),
      tripId: input.tripId,
      initiatorUserId: input.initiatorUserId,
      taggedUserId: input.taggedUserId,
      organizationId: input.organizationId,
      status: 'pending',
      expiresAt,
    })
    .returning();

  return invite;
}

/**
 * Accept a TripTagInvite.
 *
 * Creates a new Trip row for the tagged member, copying all vehicle fields
 * from the initiator's trip. The copied trip has:
 *   - vehicle_plate_number, vehicle_description, transport_company from initiator
 *   - user_vehicle_id set to null (their personal vehicle record is not used)
 *   - vehicle_copied_from_initiator = true
 *   - vehicle_source_initiator_name = initiator's full_name
 */
export async function acceptTripTagInvite(
  inviteId: string,
  taggedUserId: string
): Promise<typeof trips.$inferSelect> {
  const invite = await db.query.tripTagInvites.findFirst({
    where: and(
      eq(tripTagInvites.id, inviteId),
      eq(tripTagInvites.taggedUserId, taggedUserId)
    ),
  });

  if (!invite) {
    throw Object.assign(new Error('Invite not found'), { statusCode: 404 });
  }

  if (invite.status !== 'pending') {
    throw Object.assign(
      new Error(`Invite is already ${invite.status}`),
      { statusCode: 400 }
    );
  }

  if (new Date() > invite.expiresAt) {
    // Mark as expired if we catch it at acceptance time.
    await db
      .update(tripTagInvites)
      .set({ status: 'window_expired' })
      .where(eq(tripTagInvites.id, inviteId));
    throw Object.assign(new Error('Invite has expired'), { statusCode: 400 });
  }

  // Fetch the initiator's trip to copy vehicle fields.
  const initiatorTrip = await db.query.trips.findFirst({
    where: eq(trips.id, invite.tripId),
  });

  if (!initiatorTrip) {
    throw Object.assign(new Error('Initiator trip not found'), { statusCode: 404 });
  }

  // Fetch the initiator's full name.
  const initiator = await db.query.users.findFirst({
    where: eq(users.id, invite.initiatorUserId),
  });

  const newTripId = uuidv4();

  const [taggedTrip, updatedInvite] = await db.transaction(async (tx) => {
    // Create a new trip for the tagged member with copied vehicle info.
    const [newTrip] = await tx
      .insert(trips)
      .values({
        id: newTripId,
        userId: taggedUserId,
        organizationId: invite.organizationId,
        registeredBy: invite.initiatorUserId,
        userVehicleId: null, // explicitly null — vehicle comes from initiator's trip
        origin: initiatorTrip.origin,
        destination: initiatorTrip.destination,
        status: 'draft' as TripStatus,
        vehicleType: initiatorTrip.vehicleType,
        vehiclePlateNumber: initiatorTrip.vehiclePlateNumber,
        vehicleDescription: initiatorTrip.vehicleDescription,
        transportCompany: initiatorTrip.transportCompany,
        vehicleCopiedFromInitiator: true,
        vehicleSourceInitiatorName: initiator?.fullName ?? null,
        driverName: initiatorTrip.driverName,
        driverPhone: initiatorTrip.driverPhone,
        routePolyline: initiatorTrip.routePolyline,
        paymentIds: [],
      })
      .returning();

    // Mark invite as accepted and link to the newly created trip.
    const [inv] = await tx
      .update(tripTagInvites)
      .set({
        status: 'accepted',
        acceptedAt: new Date(),
        linkedTripId: newTripId,
      })
      .where(eq(tripTagInvites.id, inviteId))
      .returning();

    return [newTrip, inv] as const;
  });

  void updatedInvite; // invite is updated but caller only needs the trip
  return taggedTrip;
}

/**
 * Start monitoring a trip: deducts ₦2,000 from the user's wallet,
 * transitions the trip status from 'draft' to 'active'.
 */
export async function startTrip(
  tripId: string,
  userId: string
): Promise<typeof trips.$inferSelect> {
  const trip = await db.query.trips.findFirst({
    where: and(eq(trips.id, tripId), eq(trips.userId, userId)),
  });

  if (!trip) {
    throw Object.assign(new Error('Trip not found'), { statusCode: 404 });
  }

  assertValidTransition(trip.status, 'active');

  // Check if trip is org-covered (user is an org member)
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const isOrgCovered = !!(user?.organizationId || trip.organizationId);

  let updatedTrip: typeof trips.$inferSelect;

  if (!isOrgCovered) {
    const wallet = await createWallet({ ownerType: 'user', ownerId: userId });
    if (!wallet.isActive) {
      throw Object.assign(
        new Error('Your wallet is frozen. Please contact support.'),
        { statusCode: 400 }
      );
    }

    const tripPrice = env.TRIP_PRICE_NGN;

    if (wallet.balance < tripPrice) {
      throw Object.assign(
        new Error(
          `Insufficient balance. Trip costs ₦${tripPrice}. Your balance is ₦${wallet.balance}.`
        ),
        { statusCode: 402 }
      );
    }

    // Atomic deduction within a transaction.
    const [deductedTrip] = await db.transaction(async (tx) => {
      const newBalance = wallet.balance - tripPrice;

      await tx
        .update(wallets)
        .set({ balance: newBalance, updatedAt: new Date() })
        .where(eq(wallets.id, wallet.id));

      await tx.insert(walletTransactions).values({
        id: uuidv4(),
        walletId: wallet.id,
        transactionType: 'trip_charge',
        amount: -tripPrice,
        balanceBefore: wallet.balance,
        balanceAfter: newBalance,
        tripId: tripId,
        description: `Trip charge: ₦${tripPrice}`,
        status: 'completed',
      });

      const [updated] = await tx
        .update(trips)
        .set({
          status: 'active' as TripStatus,
          startedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(trips.id, tripId))
        .returning();

      return [updated];
    });

    updatedTrip = deductedTrip;
  } else {
    // Org-covered trip: skip wallet check and just transition to active.
    const [updated] = await db
      .update(trips)
      .set({
        status: 'active' as TripStatus,
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(trips.id, tripId))
      .returning();

    updatedTrip = updated;
  }

  // Broadcast trip status change to WebSocket subscribers.
  broadcastTripStatus(tripId, 'active');

  return updatedTrip;
}

// ────────────────────────────────────────────────────────────
// GPS updates
// ────────────────────────────────────────────────────────────

/**
 * Record a GPS position update for an active trip.
 * Broadcasts the position to all subscribed WebSocket clients.
 */
export async function updateGpsPosition(
  tripId: string,
  userId: string,
  data: GpsUpdateInput
): Promise<void> {
  const trip = await db.query.trips.findFirst({
    where: and(eq(trips.id, tripId), eq(trips.userId, userId)),
  });

  if (!trip) {
    throw Object.assign(new Error('Trip not found'), { statusCode: 404 });
  }

  if (!isActiveStatus(trip.status)) {
    throw Object.assign(
      new Error('Cannot update GPS for a completed or cancelled trip'),
      { statusCode: 422 }
    );
  }

  await db
    .update(trips)
    .set({ updatedAt: new Date() })
    .where(eq(trips.id, tripId));

  // Persist to DynamoDB (24-hour TTL) for WebSocket snapshot delivery and
  // admin /active page-load enrichment.
  // Fire-and-forget: a DynamoDB hiccup must never block the GPS update flow.
  saveTripLocation(tripId, {
    latitude: data.latitude,
    longitude: data.longitude,
    speed: data.speed ?? null,
    heading: data.heading ?? null,
    timestamp: new Date().toISOString(),
  }).catch((err: unknown) => {
    console.warn('[DynamoDB] saveTripLocation failed for trip', tripId, (err as Error)?.message);
  });

  // Broadcast GPS position to all WebSocket clients subscribed to this trip
  // and to all connected admin/monitoring_officer clients for the live map.
  broadcastGpsUpdate(tripId, {
    latitude: data.latitude,
    longitude: data.longitude,
    speed: data.speed,
    heading: data.heading,
  });
}

// ────────────────────────────────────────────────────────────
// Trip completion / cancellation
// ────────────────────────────────────────────────────────────

/**
 * Mark a trip as completed (safe arrival confirmed).
 */
export async function completeTrip(
  tripId: string,
  userId: string
): Promise<typeof trips.$inferSelect> {
  const trip = await db.query.trips.findFirst({
    where: and(eq(trips.id, tripId), eq(trips.userId, userId)),
  });

  if (!trip) {
    throw Object.assign(new Error('Trip not found'), { statusCode: 404 });
  }

  assertValidTransition(trip.status, 'completed');

  const [updated] = await db
    .update(trips)
    .set({
      status: 'completed' as TripStatus,
      actualArrival: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(trips.id, tripId))
    .returning();

  broadcastTripStatus(tripId, 'completed');
  return updated;
}

/**
 * Cancel a trip (only from 'draft' or 'active' status).
 */
export async function cancelTrip(
  tripId: string,
  userId: string
): Promise<typeof trips.$inferSelect> {
  const trip = await db.query.trips.findFirst({
    where: and(eq(trips.id, tripId), eq(trips.userId, userId)),
  });

  if (!trip) {
    throw Object.assign(new Error('Trip not found'), { statusCode: 404 });
  }

  assertValidTransition(trip.status, 'cancelled');

  const [updated] = await db
    .update(trips)
    .set({
      status: 'cancelled' as TripStatus,
      updatedAt: new Date(),
    })
    .where(eq(trips.id, tripId))
    .returning();

  broadcastTripStatus(tripId, 'cancelled');
  return updated;
}

// ────────────────────────────────────────────────────────────
// Admin: status override
// ────────────────────────────────────────────────────────────

/**
 * Admin-only: force a trip status change.
 */
export async function adminUpdateTripStatus(
  tripId: string,
  newStatus: TripStatus
): Promise<typeof trips.$inferSelect> {
  const trip = await db.query.trips.findFirst({
    where: eq(trips.id, tripId),
  });

  if (!trip) {
    throw Object.assign(new Error('Trip not found'), { statusCode: 404 });
  }

  const [updated] = await db
    .update(trips)
    .set({
      status: newStatus,
      updatedAt: new Date(),
      ...(newStatus === 'completed' ? { actualArrival: new Date() } : {}),
    })
    .where(eq(trips.id, tripId))
    .returning();

  broadcastTripStatus(tripId, newStatus);
  return updated;
}

// ────────────────────────────────────────────────────────────
// Queries
// ────────────────────────────────────────────────────────────

/**
 * Get a single trip by ID.
 *
 * Access logic (in priority order):
 *  1. No userId provided → admin/unrestricted path, return any trip.
 *  2. userId matches trips.user_id → direct ownership, return the trip.
 *  3. orgId (from JWT) matches trips.organization_id → org-member access.
 *  4. JWT orgId absent (stale token) → live-lookup the caller's current
 *     organizationId from the users table and retry the org check. This
 *     handles the window between a user joining an org and their next
 *     token refresh.
 *  5. The caller is the tagged user on an accepted tripTagInvite whose
 *     initiator's trip is `tripId` — grant read access so the tagged
 *     member can see the trip they were tagged on.
 *  6. None of the above → return null (caller gets 404).
 */
export async function getTripById(
  tripId: string,
  userId?: string,
  orgId?: string,
): Promise<typeof trips.$inferSelect | null> {
  // Unrestricted admin path.
  if (!userId) {
    const trip = await db.query.trips.findFirst({ where: eq(trips.id, tripId) });
    return trip ?? null;
  }

  // ── Check 1: Direct ownership (fast path, single indexed lookup). ──
  const ownedTrip = await db.query.trips.findFirst({
    where: and(eq(trips.id, tripId), eq(trips.userId, userId)),
  });
  if (ownedTrip) {
    console.debug('[getTripById] GRANTED via direct ownership tripId=%s userId=%s', tripId, userId);
    return ownedTrip;
  }

  // ── Check 2: Org-membership. ──
  // Resolve the effective orgId: prefer the JWT claim (already decoded, no DB
  // hit), fall back to a live users table lookup for callers whose token was
  // issued before they joined an organisation (stale JWT window).
  const liveUser = orgId
    ? null
    : await db.query.users.findFirst({ where: eq(users.id, userId) });

  const effectiveOrgId = orgId ?? liveUser?.organizationId ?? undefined;

  // Log the raw values so we can see exactly what each lookup returned.
  console.debug(
    '[getTripById] ownership=miss jwtOrgId=%s liveUserOrgId=%s effectiveOrgId=%s',
    orgId ?? 'none',
    liveUser?.organizationId ?? 'none',
    effectiveOrgId ?? 'none',
  );

  if (effectiveOrgId) {
    const orgTrip = await db.query.trips.findFirst({
      where: and(eq(trips.id, tripId), eq(trips.organizationId, effectiveOrgId)),
    });
    if (orgTrip) {
      console.debug('[getTripById] GRANTED via org-membership tripId=%s orgId=%s', tripId, effectiveOrgId);
      return orgTrip;
    }
    // Log the trip's actual org so we can see if there is an org mismatch.
    const rawTrip = await db.query.trips.findFirst({ where: eq(trips.id, tripId) });
    console.debug(
      '[getTripById] org-check miss — trip.organization_id=%s caller.effectiveOrgId=%s tripExists=%s',
      rawTrip?.organizationId ?? 'null',
      effectiveOrgId,
      rawTrip ? 'yes' : 'no',
    );
  } else {
    // No org at all — still do a raw trip lookup so we can log the trip's org.
    const rawTrip = await db.query.trips.findFirst({ where: eq(trips.id, tripId) });
    console.debug(
      '[getTripById] org-check skipped (no org) — trip.organization_id=%s tripExists=%s',
      rawTrip?.organizationId ?? 'null',
      rawTrip ? 'yes' : 'no',
    );
  }

  // ── Check 3: TripTagInvite — tagged user reading the initiator's trip. ──
  //
  // When a trip tag invite is accepted, `acceptTripTagInvite` creates a *new*
  // trip row owned by the tagged user (linked via tripTagInvites.linked_trip_id).
  // The tagged user should also be able to read the *original* initiator trip
  // (the one they were invited onto) so the mobile app can surface full context.
  //
  // We grant access if an accepted invite exists where:
  //   initiator_trip_id = tripId  AND  tagged_user_id = userId
  const taggedInvite = await db.query.tripTagInvites.findFirst({
    where: and(
      eq(tripTagInvites.tripId, tripId),
      eq(tripTagInvites.taggedUserId, userId),
      eq(tripTagInvites.status, 'accepted'),
    ),
  });

  if (taggedInvite) {
    const taggedTrip = await db.query.trips.findFirst({ where: eq(trips.id, tripId) });
    if (taggedTrip) {
      console.debug(
        '[getTripById] GRANTED via tripTagInvite inviteId=%s tripId=%s taggedUserId=%s',
        taggedInvite.id,
        tripId,
        userId,
      );
      return taggedTrip;
    }
  }

  console.debug('[getTripById] DENIED all checks failed tripId=%s userId=%s', tripId, userId);
  return null;
}

/**
 * List all trips belonging to an organisation, with optional status filtering.
 * Used by transport and corporate dashboard users whose JWT carries an orgId.
 */
export async function getOrgTrips(
  organizationId: string,
  filter: TripFilter = {}
): Promise<typeof trips.$inferSelect[]> {
  const conditions = [eq(trips.organizationId, organizationId)];

  if (filter.status) {
    const statusValues = Array.isArray(filter.status)
      ? filter.status.map(asTripStatus)
      : [asTripStatus(filter.status)];

    if (statusValues.length > 0) {
      conditions.push(inArray(trips.status, statusValues));
    }
  }

  return db.query.trips.findMany({
    where: and(...conditions),
    orderBy: desc(trips.createdAt),
    limit: filter.limit ?? 200,
    offset: filter.offset ?? 0,
  });
}

/**
 * List trips for a user, with optional status filtering.
 */
export async function getUserTrips(
  userId: string,
  filter: TripFilter = {}
): Promise<typeof trips.$inferSelect[]> {
  const conditions = [eq(trips.userId, userId)];

  if (filter.status) {
    const statusValues = Array.isArray(filter.status)
      ? filter.status.map(asTripStatus)
      : [asTripStatus(filter.status)];

    if (statusValues.length > 0) {
      conditions.push(inArray(trips.status, statusValues));
    }
  }

  return db.query.trips.findMany({
    where: and(...conditions),
    orderBy: desc(trips.createdAt),
    limit: filter.limit ?? 50,
    offset: filter.offset ?? 0,
  });
}

/**
 * Row shape returned by getActiveTrips — includes an unreadCount field
 * representing messages sent by the traveller that the admin has not yet read.
 */
export type ActiveTripRow = typeof trips.$inferSelect & { unreadCount: number };

/**
 * List all active trips (for admin dashboards).
 *
 * Each trip is enriched with `unreadCount` — the number of messages on that
 * trip where senderRole = 'user' and isRead = false. This lets the admin list
 * surface which trips have pending messages without a separate query.
 */
export async function getActiveTrips(): Promise<ActiveTripRow[]> {
  // Use a correlated subquery so the count is computed in a single round-trip.
  //
  // NOTE: ${trips.id} inside sql`` resolves to the Drizzle column descriptor
  // ("trips"."id") which is NOT a correlated reference when the outer table has
  // no alias. We reference the outer table's column via sql.raw so the database
  // treats it as a correlated reference to the outer trips row.
  const rows = await db
    .select({
      trip: trips,
      unreadCount: sql<number>`(
        SELECT COUNT(*)::int
        FROM ${messages} m
        WHERE m.trip_id = trips.id
          AND m.sender_role = 'user'
          AND m.is_read = false
      )`.as('unread_count'),
    })
    .from(trips)
    .where(inArray(trips.status, ACTIVE_STATUSES))
    .orderBy(desc(trips.createdAt))
    .limit(200);

  return rows.map((r) => ({ ...r.trip, unreadCount: r.unreadCount }));
}
