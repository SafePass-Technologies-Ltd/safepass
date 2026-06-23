import { z } from 'zod';

export const OrgSlotStatusEnum = z.enum(['empty', 'token_pending', 'active']);
export const InviteTokenStatusEnum = z.enum(['active', 'expired', 'redeemed', 'revoked']);
export const ScheduledTripStatusEnum = z.enum(['upcoming', 'missed', 'started', 'cancelled']);
export const TripTagInviteStatusEnum = z.enum(['pending', 'accepted', 'declined', 'window_expired']);

export const OrgSlotSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  status: OrgSlotStatusEnum,
  memberUserId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});

export const InviteTokenSchema = z.object({
  id: z.string().uuid(),
  slotId: z.string().uuid(),
  organizationId: z.string().uuid(),
  token: z.string(),
  expiresAt: z.string().datetime(),
  redeemedBy: z.string().uuid().nullable(),
  redeemedAt: z.string().datetime().nullable(),
  status: InviteTokenStatusEnum,
  createdAt: z.string().datetime(),
});

export const ScheduledTripDestinationSchema = z.object({
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
});

export const ScheduledTripSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  destination: ScheduledTripDestinationSchema,
  scheduledAt: z.string().datetime(),
  vehicle: z.object({
    type: z.string().optional(),
    plateNumber: z.string().optional(),
    transportCompany: z.string().optional(),
  }).nullable(),
  label: z.string().nullable(),
  status: ScheduledTripStatusEnum,
  reminderSentAt: z.string().datetime().nullable(),
  linkedTripId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ScheduledTripCreateSchema = z.object({
  destination: ScheduledTripDestinationSchema,
  scheduledAt: z.string().datetime(),
  vehicle: z.object({
    type: z.string().optional(),
    plateNumber: z.string().optional(),
    transportCompany: z.string().optional(),
  }).optional().nullable(),
  label: z.string().optional().nullable(),
});

export const TripTagInviteSchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  initiatorUserId: z.string().uuid(),
  taggedUserId: z.string().uuid(),
  organizationId: z.string().uuid(),
  status: TripTagInviteStatusEnum,
  acceptedAt: z.string().datetime().nullable(),
  linkedTripId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export type OrgSlot = z.infer<typeof OrgSlotSchema>;
export type InviteToken = z.infer<typeof InviteTokenSchema>;
export type ScheduledTrip = z.infer<typeof ScheduledTripSchema>;
export type ScheduledTripCreate = z.infer<typeof ScheduledTripCreateSchema>;
export type TripTagInvite = z.infer<typeof TripTagInviteSchema>;
