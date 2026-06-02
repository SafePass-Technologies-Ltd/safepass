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
