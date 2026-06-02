import { z } from 'zod';

export const OrganizationTypeEnum = z.enum(['corporate', 'transport_partner']);

export const OrgVerificationStatusEnum = z.enum(['pending', 'verified', 'rejected']);

export const SubscriptionPlanEnum = z.enum([
  'starter',
  'business',
  'enterprise',
  'standard',
  'fleet',
  'none',
]);

export const OrganizationSchema = z.object({
  id: z.string().uuid(),
  type: OrganizationTypeEnum,
  name: z.string().min(1),
  rcNumber: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  contactPerson: z.string().min(1),
  contactPhone: z.string().min(1),
  contactEmail: z.string().email().optional().nullable(),
  verificationStatus: OrgVerificationStatusEnum.default('pending'),
  subscriptionPlan: SubscriptionPlanEnum.default('none'),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
});

export type OrganizationType = z.infer<typeof OrganizationTypeEnum>;
export type OrgVerificationStatus = z.infer<typeof OrgVerificationStatusEnum>;
export type SubscriptionPlan = z.infer<typeof SubscriptionPlanEnum>;
export type Organization = z.infer<typeof OrganizationSchema>;
