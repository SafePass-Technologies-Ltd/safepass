// Shared TypeScript types used across table definitions.
// These mirror the JSONB structure types (not database columns).

/** An emergency contact stored as JSONB on the users table. */
export interface EmergencyContact {
  name: string;
  relationship?: string;
  phone: string;
  phoneWhatsappEnabled?: boolean;
  email?: string;
}

/** Notification preferences stored as JSONB on the users table. */
export interface NotificationPreferences {
  pushEnabled: boolean;
  emailEnabled: boolean;
}

/** A GPS location stored as JSONB on trips and incidents tables. */
export interface Location {
  name?: string;
  latitude: number;
  longitude: number;
  address?: string;
}

/**
 * Counts of non-terminal status re-entries for a trip, stored as JSONB on the
 * trips table. Only tracks `delayed` here -- `emergency` and `escalated`
 * counts for TripSummary are derived at read time from the durable
 * `emergency_events` and `escalations` tables (the actual source of truth
 * for those transitions, which happen via dedicated flows outside
 * adminUpdateTripStatus). `delayed` has no dedicated table, so it is the one
 * transition this counter exists to track -- incremented in
 * trip.service.ts's adminUpdateTripStatus, the only code path that can set
 * a trip to 'delayed' today. See docs/SafePass/architecture.md's Trip Data
 * Persistence section and schema.md's TripSummary.status_transition_counts.
 */
export interface StatusTransitionCounts {
  delayed: number;
}
