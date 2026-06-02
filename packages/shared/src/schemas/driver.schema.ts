import { z } from 'zod';

export const DriverSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  fullName: z.string().min(1),
  phone: z.string().min(1),
  licenseNumber: z.string().min(1),
  photoUrl: z.string().url().optional().nullable(),
  assignedVehicleId: z.string().uuid().optional().nullable(),
  isVerified: z.boolean().default(false),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
});

export const DriverCreateSchema = z.object({
  organizationId: z.string().uuid(),
  fullName: z.string().min(1, 'Name is required'),
  phone: z.string().min(1, 'Phone is required'),
  licenseNumber: z.string().min(1, 'License number is required'),
  photoUrl: z.string().url().optional(),
  assignedVehicleId: z.string().uuid().optional(),
});

export type Driver = z.infer<typeof DriverSchema>;
export type DriverCreate = z.infer<typeof DriverCreateSchema>;
