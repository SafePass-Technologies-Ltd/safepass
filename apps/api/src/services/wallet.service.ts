/**
 * Wallet Service — virtual wallet management.
 *
 * Supports individual users and organizations. Provides atomic
 * debit/credit operations, transaction logging, and balance queries.
 */
import { v4 as uuidv4 } from 'uuid';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db';
import { wallets, walletTransactions } from '../db/schema';
import { env } from '../env';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface WalletCreateInput {
  ownerType: 'user' | 'organization';
  ownerId: string;
}

export interface WalletDebitInput {
  walletId?: string;
  ownerType?: 'user' | 'organization';
  ownerId?: string;
  amount: number;
  transactionType: 'trip_charge' | 'subscription_charge' | 'withdrawal';
  description: string;
  tripId?: string;
  paymentId?: string;
}

export interface WalletCreditInput {
  walletId?: string;
  ownerType?: 'user' | 'organization';
  ownerId?: string;
  amount: number;
  transactionType: 'deposit' | 'refund' | 'admin_adjustment';
  description: string;
  paymentId?: string;
  tripId?: string;
}

// ────────────────────────────────────────────────────────────
// Wallet CRUD
// ────────────────────────────────────────────────────────────

/**
 * Create a wallet for a user or organization.
 * Idempotent — returns the existing wallet if one already exists.
 */
export async function createWallet(
  input: WalletCreateInput
): Promise<typeof wallets.$inferSelect> {
  // Check for existing wallet.
  const existing = await db.query.wallets.findFirst({
    where: and(
      eq(wallets.ownerType, input.ownerType),
      eq(wallets.ownerId, input.ownerId)
    ),
  });

  if (existing) return existing;

  const [wallet] = await db
    .insert(wallets)
    .values({
      id: uuidv4(),
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      balance: 0,
      currency: 'NGN',
    })
    .returning();

  return wallet;
}

/**
 * Get a wallet by owner type and ID.
 */
export async function getWallet(
  ownerType: 'user' | 'organization',
  ownerId: string
): Promise<typeof wallets.$inferSelect | null> {
  const result = await db.query.wallets.findFirst({
    where: and(
      eq(wallets.ownerType, ownerType),
      eq(wallets.ownerId, ownerId)
    ),
  });
  return result ?? null;
}

/**
 * Resolve a wallet — accepts either a walletId or ownerType+ownerId.
 */
async function resolveWallet(input: {
  walletId?: string;
  ownerType?: 'user' | 'organization';
  ownerId?: string;
}): Promise<typeof wallets.$inferSelect> {
  let wallet: typeof wallets.$inferSelect | undefined;

  if (input.walletId) {
    wallet = await db.query.wallets.findFirst({
      where: eq(wallets.id, input.walletId),
    });
  } else if (input.ownerType && input.ownerId) {
    wallet = await db.query.wallets.findFirst({
      where: and(
        eq(wallets.ownerType, input.ownerType),
        eq(wallets.ownerId, input.ownerId)
      ),
    });
  }

  if (!wallet) {
    throw Object.assign(
      new Error('Wallet not found'),
      { statusCode: 404 }
    );
  }

  if (!wallet.isActive) {
    throw Object.assign(
      new Error('Wallet is frozen. Contact support.'),
      { statusCode: 403 }
    );
  }

  return wallet;
}

// ────────────────────────────────────────────────────────────
// Debit / Credit (atomic)
// ────────────────────────────────────────────────────────────

/**
 * Debit a wallet (e.g., trip charge, subscription charge).
 * Atomic: uses a DB transaction with SELECT FOR UPDATE via Drizzle.
 */
export async function debitWallet(
  input: WalletDebitInput
): Promise<{
  wallet: typeof wallets.$inferSelect;
  transaction: typeof walletTransactions.$inferSelect;
}> {
  const wallet = await resolveWallet(input);

  // Sanity: debit amounts should be positive; we negate internally.
  const absAmount = Math.abs(input.amount);
  if (wallet.balance < absAmount) {
    throw Object.assign(
      new Error(
        `Insufficient balance. Required: ₦${absAmount}, Available: ₦${wallet.balance}`
      ),
      { statusCode: 402 }
    );
  }

  return db.transaction(async (tx) => {
    // 1. Deduct balance
    const newBalance = wallet.balance - absAmount;
    const [updated] = await tx
      .update(wallets)
      .set({ balance: newBalance, updatedAt: new Date() })
      .where(eq(wallets.id, wallet.id))
      .returning();

    // 2. Log transaction (amount stored as negative for debits)
    const [txn] = await tx
      .insert(walletTransactions)
      .values({
        id: uuidv4(),
        walletId: wallet.id,
        transactionType: input.transactionType,
        amount: -absAmount,
        balanceBefore: wallet.balance,
        balanceAfter: newBalance,
        tripId: input.tripId ?? null,
        paymentId: input.paymentId ?? null,
        description: input.description,
        status: 'completed',
      })
      .returning();

    return { wallet: updated, transaction: txn };
  });
}

/**
 * Credit a wallet (e.g., deposit from payment gateway, refund).
 * Atomic: uses a DB transaction.
 */
export async function creditWallet(
  input: WalletCreditInput
): Promise<{
  wallet: typeof wallets.$inferSelect;
  transaction: typeof walletTransactions.$inferSelect;
}> {
  const wallet = await resolveWallet(input);

  const amount = Math.abs(input.amount);

  return db.transaction(async (tx) => {
    const newBalance = wallet.balance + amount;
    const [updated] = await tx
      .update(wallets)
      .set({ balance: newBalance, updatedAt: new Date() })
      .where(eq(wallets.id, wallet.id))
      .returning();

    const [txn] = await tx
      .insert(walletTransactions)
      .values({
        id: uuidv4(),
        walletId: wallet.id,
        transactionType: input.transactionType,
        amount: amount, // positive for credits
        balanceBefore: wallet.balance,
        balanceAfter: newBalance,
        tripId: input.tripId ?? null,
        paymentId: input.paymentId ?? null,
        description: input.description,
        status: 'completed',
      })
      .returning();

    return { wallet: updated, transaction: txn };
  });
}

// ────────────────────────────────────────────────────────────
// Queries
// ────────────────────────────────────────────────────────────

/**
 * Get transaction history for a wallet.
 */
export async function getWalletTransactions(
  walletId: string,
  limit = 50,
  offset = 0
): Promise<typeof walletTransactions.$inferSelect[]> {
  return db.query.walletTransactions.findMany({
    where: eq(walletTransactions.walletId, walletId),
    orderBy: desc(walletTransactions.createdAt),
    limit,
    offset,
  });
}

/**
 * Freeze a wallet (admin action).
 */
export async function freezeWallet(
  walletId: string,
  freeze: boolean
): Promise<typeof wallets.$inferSelect> {
  const [updated] = await db
    .update(wallets)
    .set({ isActive: !freeze, updatedAt: new Date() })
    .where(eq(wallets.id, walletId))
    .returning();

  if (!updated) {
    throw Object.assign(new Error('Wallet not found'), { statusCode: 404 });
  }

  return updated;
}
