import { z } from 'zod';

export const WalletOwnerTypeEnum = z.enum(['user', 'organization']);

export const TransactionTypeEnum = z.enum([
  'deposit',
  'trip_charge',
  'subscription_charge',
  'refund',
  'admin_adjustment',
  'withdrawal',
]);

export const TransactionStatusEnum = z.enum(['pending', 'completed', 'failed', 'reversed']);

export const WalletSchema = z.object({
  id: z.string().uuid(),
  ownerType: WalletOwnerTypeEnum,
  ownerId: z.string().uuid(),
  balance: z.number().default(0),
  currency: z.string().default('NGN'),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const WalletTransactionSchema = z.object({
  id: z.string().uuid(),
  walletId: z.string().uuid(),
  transactionType: TransactionTypeEnum,
  amount: z.number(),
  balanceBefore: z.number(),
  balanceAfter: z.number(),
  paymentId: z.string().uuid().optional().nullable(),
  tripId: z.string().uuid().optional().nullable(),
  description: z.string().optional(),
  status: TransactionStatusEnum,
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string().datetime(),
});

export const WalletFundSchema = z.object({
  amount: z.number().min(2000, 'Minimum top-up is ₦2,000'),
  ownerId: z.string().uuid(),
  ownerType: WalletOwnerTypeEnum,
});

export type WalletOwnerType = z.infer<typeof WalletOwnerTypeEnum>;
export type TransactionType = z.infer<typeof TransactionTypeEnum>;
export type TransactionStatus = z.infer<typeof TransactionStatusEnum>;
export type Wallet = z.infer<typeof WalletSchema>;
export type WalletTransaction = z.infer<typeof WalletTransactionSchema>;
export type WalletFund = z.infer<typeof WalletFundSchema>;
