import { z } from 'zod';

export const EscalationStatusEnum = z.enum([
  'pending',
  'acknowledged',
  'in_progress',
  'resolved',
  'closed',
]);

export const EscalationSchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  emergencyEventId: z.string().uuid().optional().nullable(),
  escalatedBy: z.string().uuid(),
  escalatedTo: z.string().uuid().optional().nullable(),
  reason: z.string().min(1),
  notes: z.string().optional().nullable(),
  status: EscalationStatusEnum,
  resolutionNotes: z.string().optional().nullable(),
  resolvedBy: z.string().uuid().optional().nullable(),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional().nullable(),
});

export const EscalationCreateSchema = z.object({
  tripId: z.string().uuid(),
  emergencyEventId: z.string().uuid().optional(),
  reason: z.string().min(1, 'Reason is required'),
  notes: z.string().optional(),
});

export type EscalationStatus = z.infer<typeof EscalationStatusEnum>;
export type Escalation = z.infer<typeof EscalationSchema>;
export type EscalationCreate = z.infer<typeof EscalationCreateSchema>;
