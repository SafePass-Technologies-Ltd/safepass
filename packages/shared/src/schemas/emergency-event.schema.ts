import { z } from 'zod';

export const TriggerTypeEnum = z.enum([
  'panic_button',
  'auto_detect_crash',
  'auto_detect_stop',
  'auto_detect_deviation',
  'admin_manual',
]);

export const EmergencyStatusEnum = z.enum([
  'active',
  'acknowledged',
  'escalated',
  'resolved_false_alarm',
  'resolved_incident',
]);

export const EmergencyEventSchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  triggerType: TriggerTypeEnum,
  status: EmergencyStatusEnum,
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    speed: z.number().optional(),
    timestamp: z.string().datetime(),
  }),
  audioRecordingUrls: z.array(z.string().url()).optional(),
  videoRecordingUrls: z.array(z.string().url()).optional(),
  emergencyContactNotified: z.boolean().default(false),
  officerId: z.string().uuid().optional().nullable(),
  resolutionNotes: z.string().optional().nullable(),
  escalatedTo: z.string().uuid().optional().nullable(),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional().nullable(),
});

export const EmergencyTriggerSchema = z.object({
  tripId: z.string().uuid(),
  triggerType: TriggerTypeEnum.default('panic_button'),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    speed: z.number().optional(),
  }),
});

export type TriggerType = z.infer<typeof TriggerTypeEnum>;
export type EmergencyStatus = z.infer<typeof EmergencyStatusEnum>;
export type EmergencyEvent = z.infer<typeof EmergencyEventSchema>;
export type EmergencyTrigger = z.infer<typeof EmergencyTriggerSchema>;
