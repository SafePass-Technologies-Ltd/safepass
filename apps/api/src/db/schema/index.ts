// =============================================================================
// SafePass Database Schema — Barrel Export
//
// Organised by domain:
//   enums.ts        — All PostgreSQL enums (must be imported first)
//   types.ts        — Shared TypeScript interfaces for JSONB columns
//   users.ts        — users table
//   user-vehicles.ts — user_vehicles table
//   organizations.ts — organizations table
//   trips.ts        — trips table
//   payments.ts     — payments table
//   wallets.ts      — wallets + wallet_transactions tables
//   messages.ts     — messages table
//   incidents.ts    — incidents table
//   map-markers.ts  — map_markers + map_marker_interactions tables
//   emergency.ts    — emergency_events + escalations + checkIns tables
//   transport.ts    — transport_vehicles + drivers + documents tables
// =============================================================================

// Enums and types first (no table dependencies)
export * from './enums';
export type { EmergencyContact, NotificationPreferences, Location } from './types';

// Core entity tables
export { users } from './users';
export { userVehicles } from './user-vehicles';
export { organizations } from './organizations';
export { roleUpgradeRequests } from './role-upgrade-requests';

// Trip and commerce tables
export { trips } from './trips';
export { payments } from './payments';
export { wallets, walletTransactions } from './wallets';

// Communication and safety tables
export { messages } from './messages';
export { incidents } from './incidents';
export { mapMarkers, mapMarkerInteractions, mapMarkerImports } from './map-markers';

// Emergency and operations tables
export { emergencyEvents, escalations, checkIns } from './emergency';
export { transportVehicles, drivers, documents } from './transport';

// Subscription plan requests (C-20, T-20)
export { subscriptionRequests } from './subscription-requests';
export { subscriptionRequestStatusEnum } from './enums';

// FCM push notification tokens
export { fcmTokens } from './fcm-tokens';

// Org membership, invite tokens, scheduled trips, trip tag invites
export {
  orgSlots,
  inviteTokens,
  scheduledTrips,
  tripTagInvites,
  orgSlotStatusEnum,
  inviteTokenStatusEnum,
  scheduledTripStatusEnum,
  tripTagInviteStatusEnum,
} from './org-membership';
