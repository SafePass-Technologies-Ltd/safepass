import { z } from 'zod';

export const CheckInMethodEnum = z.enum(['message', 'call', 'sms']);

export const CheckInResponseEnum = z.enum([
  'pending',
  'confirmed_safe',
  'no_response',
  'concern_raised',
]);

export const CheckInSchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  officerId: z.string().uuid(),
  method: CheckInMethodEnum,
  responseStatus: CheckInResponseEnum,
  notes: z.string().optional().nullable(),
  createdAt: z.string().datetime(),
});

export const CheckInCreateSchema = z.object({
  tripId: z.string().uuid(),
  method: CheckInMethodEnum,
  notes: z.string().optional(),
});

export type CheckInMethod = z.infer<typeof CheckInMethodEnum>;
export type CheckInResponse = z.infer<typeof CheckInResponseEnum>;
export type CheckIn = z.infer<typeof CheckInSchema>;
export type CheckInCreate = z.infer<typeof CheckInCreateSchema>;
