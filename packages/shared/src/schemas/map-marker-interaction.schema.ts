import { z } from 'zod';

export const MarkerInteractionActionEnum = z.enum([
  'confirm',
  'dispute_not_there',
  'reclassify_police',
  'reclassify_suspicious',
]);

export const MapMarkerInteractionSchema = z.object({
  id: z.string().uuid(),
  markerId: z.string().uuid(),
  userId: z.string().uuid(),
  action: MarkerInteractionActionEnum,
  notes: z.string().optional().nullable(),
  createdAt: z.string().datetime(),
});

export const MapMarkerInteractionCreateSchema = z.object({
  markerId: z.string().uuid(),
  action: MarkerInteractionActionEnum,
  notes: z.string().optional(),
});

export type MarkerInteractionAction = z.infer<typeof MarkerInteractionActionEnum>;
export type MapMarkerInteraction = z.infer<typeof MapMarkerInteractionSchema>;
export type MapMarkerInteractionCreate = z.infer<typeof MapMarkerInteractionCreateSchema>;
