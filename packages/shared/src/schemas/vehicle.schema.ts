import { z } from 'zod';

export const TransportVehicleSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  plateNumber: z.string().min(1),
  make: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  year: z.number().int().optional().nullable(),
  capacity: z.number().int().optional().nullable(),
  photoUrl: z.string().url().optional().nullable(),
  isVerified: z.boolean().default(false),
  qrCodeUrl: z.string().url().optional().nullable(),
  qrVerificationToken: z.string().optional().nullable(),
  qrGeneratedAt: z.string().datetime().optional().nullable(),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
});

export const TransportVehicleCreateSchema = z.object({
  organizationId: z.string().uuid(),
  plateNumber: z.string().min(1, 'Plate number is required'),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().int().optional(),
  capacity: z.number().int().optional(),
  photoUrl: z.string().url().optional(),
});

export const VehicleVerifyResponseSchema = z.object({
  status: z.enum(['registered', 'not_registered']),
  verification: z.enum(['verified', 'pending']).optional(),
  company: z.string().optional(),
  liveTrip: z.boolean().optional(),
});

export type TransportVehicle = z.infer<typeof TransportVehicleSchema>;
export type TransportVehicleCreate = z.infer<typeof TransportVehicleCreateSchema>;
export type VehicleVerifyResponse = z.infer<typeof VehicleVerifyResponseSchema>;
