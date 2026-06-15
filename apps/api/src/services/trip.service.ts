/**
 * Trip Service — manages the full trip lifecycle.
 *
 * Handles trip CRUD, status transitions, GPS ingestion, and the
 * wallet auto-deduction on trip start. Designed to be called from
 * route handlers (auth context already resolved).
 */
import { v4 as uuidv4 } from 'uuid';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { db } from '../db';
import { trips, wallets, walletTransactions } from '../db/schema';
import { env } from '../env';
import type { Location } from '../db/schema/types';
import {
  broadcastGpsUpdate,
  broadcastTripStatus,
} from './websocket.service';

// ────────────────────────────────────────────────────────────
// Enum column types (for Drizzle strict enum comparisons)
// ────────────────────────────────────────────────────────────

type TripStatus = typeof trips.$inferSelect['status'];
type TripMode = typeof trips.$inferSelect['tripMode'];
type VehicleType = typeof trips.$inferSelect['vehicleType'];

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface TripCreateInput {
  userId: string;
  organizationId?: string;
  tripMode: TripMode;
  userVehicleId?: string;
  origin: Location;
  destination: Location;
  vehicleType?: string;
  vehiclePlateNumber?: string;
  transportCompany?: string;
  driverName?: string;
  driverPhone?: string;
  passengerCount?: number;
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

/** Narrow a string to TripMode, defaulting to 'passenger'. */
function asTripMode(m: string): TripMode {
  if (m === 'driver' || m === 'passenger') return m;
  return 'passenger';
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
 */
export async function createTrip(
  input: TripCreateInput
): Promise<typeof trips.$inferSelect> {
  const [trip] = await db
    .insert(trips)
    .values({
      id: uuidv4(),
      userId: input.userId,
      organizationId: input.organizationId ?? null,
      registeredBy: input.userId,
      tripMode: asTripMode(input.tripMode),
      userVehicleId: input.userVehicleId ?? null,
      origin: input.origin,
      destination: input.destination,
      status: 'draft' as TripStatus,
      vehicleType: asVehicleType(input.vehicleType),
      vehiclePlateNumber: input.vehiclePlateNumber ?? null,
      transportCompany: input.transportCompany ?? null,
      driverName: input.driverName ?? null,
      driverPhone: input.driverPhone ?? null,
      passengerCount: input.passengerCount ?? 1,
      routePolyline: input.routePolyline ?? null,
      paymentIds: [],
    })
    .returning();

  return trip;
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

  // Find the user's wallet.
  const wallet = await db.query.wallets.findFirst({
    where: and(
      eq(wallets.ownerType, 'user'),
      eq(wallets.ownerId, userId)
    ),
  });

  if (!wallet || !wallet.isActive) {
    throw Object.assign(
      new Error('No active wallet found. Please set up your wallet first.'),
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
  const [updatedTrip] = await db.transaction(async (tx) => {
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

  // Update trip's last-activity timestamp.
  await db
    .update(trips)
    .set({ updatedAt: new Date() })
    .where(eq(trips.id, tripId));

  // Broadcast GPS position to all WebSocket clients subscribed to this trip.
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
 * Get a single trip by ID, with an optional ownership check.
 */
export async function getTripById(
  tripId: string,
  userId?: string
): Promise<typeof trips.$inferSelect | null> {
  const where = userId
    ? and(eq(trips.id, tripId), eq(trips.userId, userId))
    : eq(trips.id, tripId);

  const trip = await db.query.trips.findFirst({ where });
  return trip ?? null;
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
 * List all active trips (for admin dashboards).
 */
export async function getActiveTrips(): Promise<typeof trips.$inferSelect[]> {
  return db.query.trips.findMany({
    where: inArray(trips.status, ACTIVE_STATUSES),
    orderBy: desc(trips.createdAt),
    limit: 200,
  });
}
