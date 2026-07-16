import { z } from 'zod';

// M-38 Account Deletion / A-27 Account Deletion Oversight & Legal Holds.
// See docs/SafePass/schema.md's AccountDeletionRequest entity.

export const AccountDeletionStatusEnum = z.enum([
  'pending',
  'cancelled',
  'legal_hold',
  'completed',
  'force_deleted',
]);

export const DeletionPreFlightChecksSchema = z.object({
  hadActiveTrip: z.boolean(),
  walletBalanceAtRequest: z.number(),
  walletForfeited: z.boolean(),
  wasSoleOrgAdmin: z.boolean(),
});

export const AccountDeletionRequestSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  status: AccountDeletionStatusEnum,
  requestedAt: z.string().datetime(),
  scheduledFor: z.string().datetime(),
  preFlightChecks: DeletionPreFlightChecksSchema,
  legalHoldReason: z.string().nullable().optional(),
  legalHoldRefs: z.array(z.string()).optional(),
  cancelledAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  forceDeletedBy: z.string().uuid().nullable().optional(),
  forceDeleteReason: z.string().nullable().optional(),
  holdOverriddenBy: z.string().uuid().nullable().optional(),
  holdOverrideReason: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * Request body for POST /v1/users/me/deletion-request. Re-auth itself
 * happens client-side against Firebase (see user_flow.md Flow 10a) -- the
 * backend's job is to verify the caller supplied the exact typed
 * confirmation string and, where the wallet-forfeiture edge case applies,
 * an explicit forfeiture acknowledgement.
 */
export const CreateDeletionRequestSchema = z.object({
  confirmation: z.literal('DELETE', {
    errorMap: () => ({ message: 'You must type DELETE to confirm account deletion.' }),
  }),
  forfeitWalletBalance: z.boolean().optional().default(false),
});

export const ForceDeleteSchema = z.object({
  reason: z.string().min(1, 'A justification reason is required'),
  overrideHold: z.boolean().optional().default(false),
});

export const OverrideLegalHoldSchema = z.object({
  reason: z.string().min(1, 'A justification reason is required'),
});

export type AccountDeletionStatus = z.infer<typeof AccountDeletionStatusEnum>;
export type DeletionPreFlightChecks = z.infer<typeof DeletionPreFlightChecksSchema>;
export type AccountDeletionRequest = z.infer<typeof AccountDeletionRequestSchema>;
export type CreateDeletionRequest = z.infer<typeof CreateDeletionRequestSchema>;
export type ForceDelete = z.infer<typeof ForceDeleteSchema>;
export type OverrideLegalHold = z.infer<typeof OverrideLegalHoldSchema>;
