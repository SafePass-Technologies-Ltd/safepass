import { z } from 'zod';

export const VehicleTypeEnum = z.enum(['car', 'bus', 'suv', 'truck', 'motorcycle', 'other']);

export const UserVehicleSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  plateNumber: z.string().min(1, 'Plate number is required'),
  vehicleType: VehicleTypeEnum,
  make: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  colour: z.string().optional().nullable(),
  isDefault: z.boolean().default(false),
  createdAt: z.string().datetime(),
});

export const UserVehicleCreateSchema = z.object({
  plateNumber: z.string().min(1, 'Plate number is required'),
  vehicleType: VehicleTypeEnum,
  make: z.string().optional(),
  model: z.string().optional(),
  colour: z.string().optional(),
  isDefault: z.boolean().default(false),
});

export const UserVehicleUpdateSchema = z.object({
  plateNumber: z.string().min(1).optional(),
  vehicleType: VehicleTypeEnum.optional(),
  make: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  colour: z.string().optional().nullable(),
  isDefault: z.boolean().optional(),
});

export type VehicleType = z.infer<typeof VehicleTypeEnum>;
export type UserVehicle = z.infer<typeof UserVehicleSchema>;
export type UserVehicleCreate = z.infer<typeof UserVehicleCreateSchema>;
export type UserVehicleUpdate = z.infer<typeof UserVehicleUpdateSchema>;
