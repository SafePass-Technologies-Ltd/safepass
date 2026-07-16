import { z } from 'zod';
import { VehicleTypeEnum } from './user-vehicle.schema';

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
  vehicleDescription: z.string().optional().nullable(),
  transportCompany: z.string().optional().nullable(),
  vehicleCopiedFromInitiator: z.boolean().optional().nullable(),
  vehicleSourceInitiatorName: z.string().optional().nullable(),
  driverName: z.string().optional().nullable(),
  driverPhone: z.string().optional().nullable(),
  currentLocation: CurrentLocationSchema.optional().nullable(),
  routePolyline: z.string().optional().nullable(),
  paymentIds: z.array(z.string().uuid()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const TripCreateSchema = z.object({
  userId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
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
  vehicleDescription: z.string().optional(),
  transportCompany: z.string().optional(),
  driverName: z.string().optional(),
  driverPhone: z.string().optional(),
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
  // A-26: optional on-device GPS reading time. Not sent by the current
  // mobile client (which relies on server-receive time) -- forward-
  // compatible field for a future mobile release that replays
  // offline-buffered points on reconnect, so trip_location_history
  // breadcrumbs can be ordered by actual GPS reading time rather than
  // arrival order. See trip-archive.service.ts's GpsSamplePoint.
  recordedAt: z.string().datetime().optional(),
});

export type TripStatus = z.infer<typeof TripStatusEnum>;
export type Trip = z.infer<typeof TripSchema>;
export type TripCreate = z.infer<typeof TripCreateSchema>;
export type TripGpsUpdate = z.infer<typeof TripGpsUpdateSchema>;
