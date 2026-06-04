/**
 * Wallet Routes — user and admin wallet endpoints.
 *
 * /v1/wallets           — User-facing wallet operations
 * /v1/admin/wallets     — Admin wallet management
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { WalletFundSchema } from '@safepass/shared';
import { authMiddleware, requireRole } from '../middleware/auth';
import {
  getWallet,
  createWallet,
  getWalletTransactions,
  freezeWallet,
} from '../services/wallet.service';

const walletRoutes = new Hono();
walletRoutes.use('*', authMiddleware);

/**
 * GET /v1/wallets/me
 * Get the authenticated user's wallet.
 */
walletRoutes.get('/me', async (c) => {
  const user = c.get('user') as { sub: string };
  const wallet = await getWallet('user', user.sub);

  if (!wallet) {
    return c.json(
      { error: { code: 404, message: 'Wallet not found. Contact support.' } },
      404
    );
  }

  return c.json(wallet, 200);
});

/**
 * GET /v1/wallets/me/transactions
 * Get transaction history for the authenticated user's wallet.
 */
walletRoutes.get('/me/transactions', async (c) => {
  const user = c.get('user') as { sub: string };
  const wallet = await getWallet('user', user.sub);

  if (!wallet) {
    return c.json({ error: { code: 404, message: 'Wallet not found' } }, 404);
  }

  const limit = Number(c.req.query('limit') ?? '50');
  const offset = Number(c.req.query('offset') ?? '0');

  const transactions = await getWalletTransactions(wallet.id, limit, offset);
  return c.json({ wallet, transactions }, 200);
});

// ────────────────────────────────────────────────────────────
// Admin wallet routes
// ────────────────────────────────────────────────────────────

const adminWalletRoutes = new Hono();
adminWalletRoutes.use('*', authMiddleware);
adminWalletRoutes.use('*', requireRole('admin', 'super_admin'));

/**
 * GET /v1/admin/wallets/:ownerType/:ownerId
 * Get a wallet by owner type and ID (admin view).
 */
adminWalletRoutes.get('/:ownerType/:ownerId', async (c) => {
  const ownerType = c.req.param('ownerType') as 'user' | 'organization';
  const ownerId = c.req.param('ownerId');

  if (!['user', 'organization'].includes(ownerType)) {
    return c.json(
      { error: { code: 400, message: 'ownerType must be "user" or "organization"' } },
      400
    );
  }

  const wallet = await getWallet(ownerType, ownerId);
  if (!wallet) {
    return c.json({ error: { code: 404, message: 'Wallet not found' } }, 404);
  }
  return c.json(wallet, 200);
});

/**
 * GET /v1/admin/wallets/:walletId/transactions
 * Get transactions for any wallet (admin view).
 */
adminWalletRoutes.get('/:walletId/transactions', async (c) => {
  const walletId = c.req.param('walletId');
  const limit = Number(c.req.query('limit') ?? '50');
  const offset = Number(c.req.query('offset') ?? '0');

  const transactions = await getWalletTransactions(walletId, limit, offset);
  return c.json({ transactions }, 200);
});

/**
 * POST /v1/admin/wallets/:walletId/freeze
 * Freeze or unfreeze a wallet.
 */
adminWalletRoutes.post(
  '/:walletId/freeze',
  zValidator(
    'json',
    z.object({ freeze: z.boolean() })
  ),
  async (c) => {
    const walletId = c.req.param('walletId');
    const { freeze } = c.req.valid('json');

    try {
      const wallet = await freezeWallet(walletId, freeze);
      return c.json(wallet, 200);
    } catch (err: unknown) {
      if (err instanceof Error) {
        return c.json(
          { error: { code: 404, message: err.message } },
          404
        );
      }
      throw err;
    }
  }
);

export { walletRoutes, adminWalletRoutes };
