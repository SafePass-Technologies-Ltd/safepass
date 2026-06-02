import { z } from 'zod';

export const EmergencyContactSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  relationship: z.string().optional(),
  phone: z.string().min(1, 'Phone number is required'),
  phoneWhatsappEnabled: z.boolean().default(false),
  email: z.string().email().optional(),
});

export const UserRoleEnum = z.enum([
  'user',
  'admin',
  'corporate_admin',
  'transport_partner',
  'monitoring_officer',
  'super_admin',
]);

export const AuthProviderEnum = z.enum(['google', 'facebook', 'apple']);

export const UserSchema = z.object({
  id: z.string().uuid(),
  authProvider: AuthProviderEnum,
  authProviderId: z.string().min(1),
  email: z.string().email(),
  fullName: z.string().min(1),
  phone: z.string().optional().nullable(),
  role: UserRoleEnum,
  organizationId: z.string().uuid().optional().nullable(),
  emergencyContacts: z.array(EmergencyContactSchema).min(1).max(3),
  isVerified: z.boolean().default(true),
  isActive: z.boolean().default(true),
  notificationPreferences: z.object({
    pushEnabled: z.boolean().default(true),
    emailEnabled: z.boolean().default(true),
  }).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const UserCreateSchema = z.object({
  authProvider: AuthProviderEnum,
  authProviderId: z.string().min(1),
  email: z.string().email(),
  fullName: z.string().min(1),
  phone: z.string().optional(),
  role: UserRoleEnum.default('user'),
  organizationId: z.string().uuid().optional(),
  emergencyContacts: z.array(EmergencyContactSchema).min(1).max(3),
});

export const UserUpdateSchema = z.object({
  phone: z.string().optional().nullable(),
  emergencyContacts: z.array(EmergencyContactSchema).min(1).max(3).optional(),
  notificationPreferences: z.object({
    pushEnabled: z.boolean(),
    emailEnabled: z.boolean(),
  }).optional(),
});

export type EmergencyContact = z.infer<typeof EmergencyContactSchema>;
export type UserRole = z.infer<typeof UserRoleEnum>;
export type AuthProvider = z.infer<typeof AuthProviderEnum>;
export type User = z.infer<typeof UserSchema>;
export type UserCreate = z.infer<typeof UserCreateSchema>;
export type UserUpdate = z.infer<typeof UserUpdateSchema>;
