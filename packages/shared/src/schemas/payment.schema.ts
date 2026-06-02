import { z } from 'zod';

export const PaymentStatusEnum = z.enum(['pending', 'processing', 'successful', 'failed', 'refunded']);

export const PaymentTypeEnum = z.enum(['trip', 'subscription', 'refund']);

export const PaymentGatewayEnum = z.enum(['paystack', 'flutterwave', 'stripe']);

export const PaymentSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  tripId: z.string().uuid().optional().nullable(),
  organizationId: z.string().uuid().optional().nullable(),
  amount: z.number().positive(),
  currency: z.string().default('NGN'),
  status: PaymentStatusEnum,
  paymentType: PaymentTypeEnum,
  gateway: PaymentGatewayEnum,
  gatewayReference: z.string().optional().nullable(),
  gatewayResponse: z.record(z.unknown()).optional(),
  paidAt: z.string().datetime().optional().nullable(),
  createdAt: z.string().datetime(),
});

export type PaymentStatus = z.infer<typeof PaymentStatusEnum>;
export type PaymentType = z.infer<typeof PaymentTypeEnum>;
export type PaymentGateway = z.infer<typeof PaymentGatewayEnum>;
export type Payment = z.infer<typeof PaymentSchema>;
