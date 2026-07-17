/**
 * Payment Routes — wallet funding and payment verification.
 *
 * /v1/payments           — User-facing payment operations
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { env } from '../env';
import {
  initializePayment,
  verifyPayment,
  handlePaystackWebhook,
} from '../services/payment.service';

/** Loose but sufficient check -- Paystack itself does the strict validation. */
const isValidEmail = (value: string | undefined | null): value is string =>
  !!value && z.string().email().safeParse(value).success;

const paymentRoutes = new Hono();

/**
 * POST /v1/payments/initialize
 * Initialize a wallet top-up payment.
 * Returns a Paystack authorization URL for the checkout page.
 */
paymentRoutes.post(
  '/initialize',
  authMiddleware,
  zValidator(
    'json',
    z.object({
      amount: z.number().min(2000, 'Minimum top-up is ₦2,000'),
      email: z.string().email().optional(),
      gateway: z.enum(['paystack', 'flutterwave']).optional().default('paystack'),
    })
  ),
  async (c) => {
    const user = c.get('user') as { sub: string; email: string };
    const { amount, email, gateway } = c.req.valid('json');

    // Phone-signup users have no email on file (user.email is empty/absent),
    // and Paystack rejects transactions outright without one ("Invalid
    // Email Address Passed"). Fall back to a placeholder address in that
    // case -- see PAYSTACK_FALLBACK_EMAIL in env.ts for how to change it.
    const paystackEmail = isValidEmail(email)
      ? email
      : isValidEmail(user.email)
        ? user.email
        : env.PAYSTACK_FALLBACK_EMAIL;

    try {
      const result = await initializePayment({
        userId: user.sub,
        amount,
        email: paystackEmail,
        gateway,
      });

      return c.json(
        {
          paymentId: result.paymentId,
          authorizationUrl: result.authorizationUrl,
          reference: result.reference,
        },
        201
      );
    } catch (err: unknown) {
      if (err instanceof Error) {
        return c.json(
          { error: { code: 500, message: err.message } },
          500
        );
      }
      throw err;
    }
  }
);

/**
 * POST /v1/payments/verify
 * Verify a payment by gateway reference.
 * Called client-side after the user returns from the checkout page.
 */
paymentRoutes.post(
  '/verify',
  authMiddleware,
  zValidator(
    'json',
    z.object({
      reference: z.string().min(1, 'Payment reference is required'),
    })
  ),
  async (c) => {
    const { reference } = c.req.valid('json');

    try {
      const result = await verifyPayment(reference);
      return c.json(
        {
          status: 'success',
          payment: result.payment,
          walletCredited: result.walletCredited,
        },
        200
      );
    } catch (err: unknown) {
      if (err instanceof Error) {
        const code = (err as { statusCode?: number }).statusCode ?? 402;
        return c.json({ error: { code, message: err.message } }, code as 400 | 404 | 402);
      }
      throw err;
    }
  }
);

/**
 * POST /v1/payments/webhook
 * Paystack webhook endpoint (unauthenticated — validated by HMAC signature).
 *
 * SECURITY: In production, validate the x-paystack-signature header
 * against the PAYSTACK_SECRET_KEY using HMAC SHA-512.
 * For MVP: we trust the event and verify on our side.
 */
paymentRoutes.post('/webhook', async (c) => {
  const body = await c.req.json<{
    event: string;
    data: { reference: string; status: string; amount: number };
  }>();

  const event = body.event;
  const data = body.data;

  if (!event || !data?.reference) {
    return c.json({ status: 'ignored', reason: 'Invalid payload' }, 400);
  }

  try {
    const result = await handlePaystackWebhook(event, data);
    return c.json({ status: result.processed ? 'ok' : 'error', message: result.message }, 200);
  } catch {
    return c.json({ status: 'error', message: 'Webhook processing failed' }, 500);
  }
});

export { paymentRoutes };
