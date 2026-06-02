import { z } from 'zod';

export const DocumentEntityTypeEnum = z.enum(['vehicle', 'driver', 'organization']);

export const DocumentTypeEnum = z.enum([
  'vehicle_registration',
  'vehicle_insurance',
  'roadworthiness',
  'drivers_license',
  'company_cac_registration',
  'other',
]);

export const DocumentVerificationStatusEnum = z.enum(['pending', 'verified', 'rejected']);

export const DocumentSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  entityType: DocumentEntityTypeEnum,
  entityId: z.string().uuid(),
  documentType: DocumentTypeEnum,
  fileUrl: z.string().url(),
  fileName: z.string().optional(),
  verificationStatus: DocumentVerificationStatusEnum.default('pending'),
  verifiedBy: z.string().uuid().optional().nullable(),
  rejectionReason: z.string().optional().nullable(),
  createdAt: z.string().datetime(),
});

export type DocumentEntityType = z.infer<typeof DocumentEntityTypeEnum>;
export type DocumentType = z.infer<typeof DocumentTypeEnum>;
export type DocumentVerificationStatus = z.infer<typeof DocumentVerificationStatusEnum>;
export type Document = z.infer<typeof DocumentSchema>;
