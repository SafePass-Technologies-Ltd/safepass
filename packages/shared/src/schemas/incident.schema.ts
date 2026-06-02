import { z } from 'zod';

export const IncidentTypeEnum = z.enum([
  'kidnapping',
  'armed_robbery',
  'accident',
  'roadblock',
  'police_checkpoint',
  'fake_checkpoint',
  'bad_road',
  'vehicle_breakdown',
  'suspicious_activity',
]);

export const VerificationStatusEnum = z.enum([
  'unverified',
  'partially_confirmed',
  'verified',
  'disputed',
  'rejected',
]);

export const SeverityEnum = z.enum(['low', 'medium', 'high', 'critical']);

export const IncidentSchema = z.object({
  id: z.string().uuid(),
  reporterId: z.string().uuid(),
  tripId: z.string().uuid().optional().nullable(),
  incidentType: IncidentTypeEnum,
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    address: z.string().optional(),
  }),
  description: z.string().min(1),
  photoUrl: z.string().url().optional().nullable(),
  verificationStatus: VerificationStatusEnum.default('unverified'),
  verificationWeight: z.number().int().default(0),
  adminNotes: z.string().optional().nullable(),
  severity: SeverityEnum.default('medium'),
  isActive: z.boolean().default(true),
  expiresAt: z.string().datetime().optional().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const IncidentCreateSchema = z.object({
  tripId: z.string().uuid().optional(),
  incidentType: IncidentTypeEnum,
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    address: z.string().optional(),
  }),
  description: z.string().min(1, 'Description is required'),
  photoUrl: z.string().url().optional(),
});

export type IncidentType = z.infer<typeof IncidentTypeEnum>;
export type VerificationStatus = z.infer<typeof VerificationStatusEnum>;
export type Severity = z.infer<typeof SeverityEnum>;
export type Incident = z.infer<typeof IncidentSchema>;
export type IncidentCreate = z.infer<typeof IncidentCreateSchema>;
