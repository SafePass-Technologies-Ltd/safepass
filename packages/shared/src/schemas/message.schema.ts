import { z } from 'zod';

export const SenderRoleEnum = z.enum(['user', 'admin', 'monitoring_officer', 'system']);

export const MessageTypeEnum = z.enum(['text', 'check_in', 'alert', 'system']);

export const MessageSchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  senderId: z.string().uuid(),
  senderRole: SenderRoleEnum,
  content: z.string().min(1),
  messageType: MessageTypeEnum.default('text'),
  isRead: z.boolean().default(false),
  createdAt: z.string().datetime(),
});

export const MessageCreateSchema = z.object({
  tripId: z.string().uuid(),
  content: z.string().min(1, 'Message cannot be empty'),
  messageType: MessageTypeEnum.default('text'),
});

export type SenderRole = z.infer<typeof SenderRoleEnum>;
export type MessageType = z.infer<typeof MessageTypeEnum>;
export type Message = z.infer<typeof MessageSchema>;
export type MessageCreate = z.infer<typeof MessageCreateSchema>;
