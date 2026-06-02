import { z } from 'zod';
import { VehicleTypeEnum } from './user-vehicle.schema';

export const TripModeEnum = z.enum(['driver', 'passenger']);

export const TripStatusEnum = z.enum([
  'draft',
  'active',
  'delayed',
  'emergency',
  'escalated',
  'completed',
  'cancelled',
]);

export const GpsLocationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
});

export const CurrentLocationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  speed: z.number().optional(),
  heading: z.number().optional(),
  accuracy: z.number().optional(),
  timestamp: z.string().datetime(),
});

export const TripSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  registeredBy: z.string().uuid().optional().nullable(),
  organizationId: z.string().uuid().optional().nullable(),
  tripMode: TripModeEnum.default('passenger'),
  userVehicleId: z.string().uuid().optional().nullable(),
  origin: z.object({
    name: z.string().optional(),
    latitude: z.number(),
    longitude: z.number(),
  }),
  destination: z.object({
    name: z.string().optional(),
    latitude: z.number(),
    longitude: z.number(),
  }),
  status: TripStatusEnum,
  scheduledDeparture: z.string().datetime().optional().nullable(),
  startedAt: z.string().datetime().optional().nullable(),
  estimatedArrival: z.string().datetime().optional().nullable(),
  actualArrival: z.string().datetime().optional().nullable(),
  vehicleType: VehicleTypeEnum.optional().nullable(),
  vehiclePlateNumber: z.string().optional().nullable(),
  transportCompany: z.string().optional().nullable(),
  driverName: z.string().optional().nullable(),
  driverPhone: z.string().optional().nullable(),
  passengerCount: z.number().int().min(1).optional().nullable(),
  currentLocation: CurrentLocationSchema.optional().nullable(),
  routePolyline: z.string().optional().nullable(),
  paymentIds: z.array(z.string().uuid()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const TripCreateSchema = z.object({
  userId: z.string().uuid(),
  organizationId: z.string().uuid().optional(),
  tripMode: TripModeEnum.default('passenger'),
  userVehicleId: z.string().uuid().optional(),
  origin: z.object({
    name: z.string().optional(),
    latitude: z.number(),
    longitude: z.number(),
  }),
  destination: z.object({
    name: z.string().optional(),
    latitude: z.number(),
    longitude: z.number(),
  }),
  vehicleType: VehicleTypeEnum.optional(),
  vehiclePlateNumber: z.string().optional(),
  transportCompany: z.string().optional(),
  driverName: z.string().optional(),
  driverPhone: z.string().optional(),
  passengerCount: z.number().int().min(1).optional(),
  routePolyline: z.string().optional(),
});

export const TripStartSchema = z.object({
  tripId: z.string().uuid(),
});

export const TripGpsUpdateSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  speed: z.number().optional(),
  heading: z.number().optional(),
  accuracy: z.number().optional(),
});

export type TripMode = z.infer<typeof TripModeEnum>;
export type TripStatus = z.infer<typeof TripStatusEnum>;
export type Trip = z.infer<typeof TripSchema>;
export type TripCreate = z.infer<typeof TripCreateSchema>;
export type TripGpsUpdate = z.infer<typeof TripGpsUpdateSchema>;
