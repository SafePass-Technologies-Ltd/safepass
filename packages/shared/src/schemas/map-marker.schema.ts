import { z } from 'zod';
import { SeverityEnum, VerificationStatusEnum } from './incident.schema';

export const MarkerTypeEnum = z.enum([
  'kidnapping_hotspot',
  'checkpoint',
  'high_risk_zone',
  'recent_attack',
  'safe_zone',
  'admin_marker',
]);

export const MarkerSourceEnum = z.enum([
  'user_report',
  'admin_manual',
  'news_archive',
  'police_report',
  'security_advisory',
  'partner_data',
]);

export const MapMarkerSchema = z.object({
  id: z.string().uuid(),
  incidentId: z.string().uuid().optional().nullable(),
  markerType: MarkerTypeEnum,
  category: z.string().optional().nullable(),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
  title: z.string().min(1),
  description: z.string().optional(),
  severity: SeverityEnum,
  source: MarkerSourceEnum,
  verificationStatus: VerificationStatusEnum.default('unverified'),
  verificationWeight: z.number().int().default(0),
  createdBy: z.string().uuid(),
  isActive: z.boolean().default(true),
  expiresAt: z.string().datetime().optional().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const MapMarkerCreateSchema = z.object({
  markerType: MarkerTypeEnum,
  category: z.string().optional(),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  severity: SeverityEnum,
  source: MarkerSourceEnum,
  expiresAt: z.string().datetime().optional(),
});

export type MarkerType = z.infer<typeof MarkerTypeEnum>;
export type MarkerSource = z.infer<typeof MarkerSourceEnum>;
export type MapMarker = z.infer<typeof MapMarkerSchema>;
export type MapMarkerCreate = z.infer<typeof MapMarkerCreateSchema>;
