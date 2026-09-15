/**
 * Payment Service — payment gateway integration and wallet top-up.
 *
 * Handles Paystack/Flutterwave deposit flows:
 *   1. Initialize a payment (creates pending record + gateway transaction)
 *   2. Verify payment status (polling)
 *   3. Webhook handler (gateway callback → credit wallet)
 *
 * DESIGN NOTE: Gateway-specific logic is isolated so adding Flutterwave
 * or Stripe requires only new functions in this service.
 */
import { v4 as uuidv4 } from 'uuid';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { payments } from '../db/schema';
import { creditWallet, getWallet, createWallet } from './wallet.service';
import { env } from '../env';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type PaymentGateway = 'paystack' | 'flutterwave';

export interface InitializePaymentInput {
  userId: string;
  amount: number;
  email: string;
  gateway?: PaymentGateway;
}

export interface PaymentInitResult {
  paymentId: string;
  authorizationUrl: string;
  reference: string;
}

// ────────────────────────────────────────────────────────────
// Paystack API helper
// ────────────────────────────────────────────────────────────

const PAYSTACK_BASE = 'https://api.paystack.co';

/**
 * Initialize a Paystack transaction.
 * Returns the authorization URL for the Paystack checkout page.
 */
async function paystackInitialize(params: {
  email: string;
  amount: number; // in Naira (Paystack expects kobo)
  reference: string;
}): Promise<{ authorizationUrl: string; reference: string }> {
  const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error('PAYSTACK_SECRET_KEY environment variable is not set');
  }

  const response = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: params.email,
      amount: params.amount * 100, // convert Naira to kobo
      reference: params.reference,
      callback_url: undefined, // Mobile apps handle redirect natively
      metadata: { source: 'safepass_wallet_topup' },
    }),
  });

  const data = (await response.json()) as {
    status: boolean;
    message: string;
    data: {
      authorization_url: string;
      reference: string;
      access_code: string;
    };
  };

  if (!data.status) {
    throw new Error(`Paystack initialization failed: ${data.message}`);
  }

  return {
    authorizationUrl: data.data.authorization_url,
    reference: data.data.reference,
  };
}

/**
 * Verify a Paystack transaction by reference.
 */
async function paystackVerify(
  reference: string
): Promise<{ status: string; amount: number; gatewayResponse: unknown }> {
  const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error('PAYSTACK_SECRET_KEY environment variable is not set');
  }

  const response = await fetch(`${PAYSTACK_BASE}/transaction/verify/${reference}`, {
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
    },
  });

  const data = (await response.json()) as {
    status: boolean;
    data: {
      status: string;
      amount: number;
      gateway_response: string;
      reference: string;
    };
  };

  return {
    status: data.data.status,
    amount: data.data.amount / 100, // convert kobo back to Naira
    gatewayResponse: data.data,
  };
}

// ────────────────────────────────────────────────────────────
// Initialize payment
// ────────────────────────────────────────────────────────────

/**
 * Initialize a wallet top-up payment.
 *
 * 1. Ensures the user has a wallet (creates one if needed).
 * 2. Creates a Payment record (status: pending).
 * 3. Initializes the Paystack transaction and returns the checkout URL.
 *
 * After the user completes payment on Paystack's page, the webhook
 * handler will verify and credit the wallet.
 */
export async function initializePayment(
  input: InitializePaymentInput
): Promise<PaymentInitResult> {
  const gateway = input.gateway ?? 'paystack';

  // Ensure user has a wallet.
  let wallet = await getWallet('user', input.userId);
  if (!wallet) {
    wallet = await createWallet({ ownerType: 'user', ownerId: input.userId });
  }

  // Generate a unique payment reference.
  const reference = `SP-${uuidv4().slice(0, 8).toUpperCase()}`;

  // Create payment record.
  const [payment] = await db
    .insert(payments)
    .values({
      id: uuidv4(),
      userId: input.userId,
      amount: input.amount,
      currency: 'NGN',
      status: 'pending',
      paymentType: 'trip', // Wallet top-up is categorized as 'trip' payment type
      gateway,
      gatewayReference: reference,
    })
    .returning();

  // Initialize gateway transaction.
  if (gateway === 'paystack') {
    const result = await paystackInitialize({
      email: input.email,
      amount: input.amount,
      reference,
    });

    return {
      paymentId: payment.id,
      authorizationUrl: result.authorizationUrl,
      reference: result.reference,
    };
  }

  // Flutterwave initialization would go here.
  // For now, we throw if Flutterwave is requested but not configured.
  throw new Error(
    'Flutterwave integration is not yet implemented. Please use Paystack.'
  );
}

// ────────────────────────────────────────────────────────────
// Verify payment
// ────────────────────────────────────────────────────────────

/**
 * Verify a payment by gateway reference and credit the wallet if successful.
 *
 * Called from:
 *   - Webhook handler (Paystack sends charge.success event)
 *   - Client-side polling (after user returns from checkout)
 *
 * Idempotent: if the payment is already 'successful', returns immediately.
 */
export async function verifyPayment(
  gatewayReference: string
): Promise<{ payment: typeof payments.$inferSelect; walletCredited: boolean }> {
  // Find the payment record.
  const payment = await db.query.payments.findFirst({
    where: eq(payments.gatewayReference, gatewayReference),
  });

  if (!payment) {
    throw Object.assign(
      new Error(`Payment not found for reference: ${gatewayReference}`),
      { statusCode: 404 }
    );
  }

  // Already processed.
  if (payment.status === 'successful') {
    return { payment, walletCredited: false };
  }

  // Verify with Paystack.
  const verification = await paystackVerify(gatewayReference);

  if (verification.status !== 'success') {
    // Update payment as failed.
    await db
      .update(payments)
      .set({
        status: 'failed',
        gatewayResponse: verification.gatewayResponse as Record<string, unknown>,
      })
      .where(eq(payments.id, payment.id));

    throw Object.assign(
      new Error(`Payment verification failed: ${verification.status}`),
      { statusCode: 402 }
    );
  }

  // Payment successful — credit the wallet and mark payment as successful.
  return db.transaction(async (tx) => {
    // 1. Credit wallet.
    await creditWallet({
      ownerType: 'user',
      ownerId: payment.userId,
      amount: verification.amount,
      transactionType: 'deposit',
      description: `Wallet top-up via Paystack (ref: ${gatewayReference})`,
      paymentId: payment.id,
    });

    // 2. Mark payment as successful.
    const [updated] = await tx
      .update(payments)
      .set({
        status: 'successful',
        gatewayResponse: verification.gatewayResponse as Record<string, unknown>,
        paidAt: new Date(),
      })
      .where(eq(payments.id, payment.id))
      .returning();

    return { payment: updated, walletCredited: true };
  });
}

// ────────────────────────────────────────────────────────────
// Webhook handler helpers
// ────────────────────────────────────────────────────────────

/**
 * Verify the HMAC-SHA512 signature Paystack sends on every webhook in the
 * `x-paystack-signature` header.
 *
 * SECURITY RATIONALE (fail-closed): the webhook is an unauthenticated public
 * endpoint that credits wallets, so a forged request that passes this check
 * would mint money. The signature is computed over the RAW request body with
 * the gateway secret; we compare with a constant-time equality to avoid
 * timing oracles. If the secret is missing from the environment, or the
 * signature header is absent/not hex, the request is rejected — never
 * processed. This is the enforcement side of risk_log.md's payment-integrity
 * mitigation (R-004: "gateway webhooks verify HMAC signature before credit").
 */
export function verifyPaystackWebhookSignature(
  rawBody: string,
  signature: string | undefined | null
): boolean {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature) return false;

  const expectedBuffer = Buffer.from(
    createHmac('sha512', secret).update(rawBody).digest('hex'),
    'hex'
  );

  // Both buffers are guaranteed equal length here (expected is always 64
  // bytes; signature could theoretically be longer/shorter but
  // timingSafeEqual requires equal lengths, so length-mismatch is a plain
  // rejection). Note the length check is against the DECODED buffer, not the
  // 128-char hex string.
  const signatureBuffer = Buffer.from(signature, 'hex');
  if (signatureBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, signatureBuffer);
}

/**
 * Handle a Paystack webhook event.
 *
 * Paystack sends these events:
 *   - charge.success  → verify payment and credit wallet
 *   - charge.failure  → mark payment as failed (no wallet action)
 *   - transfer.success → (future: withdrawals)
 *
 * The signature check happens in the route (payment.routes.ts) BEFORE this
 * handler runs — a request that reaches here has already passed
 * verifyPaystackWebhookSignature.
 */
export async function handlePaystackWebhook(
  event: string,
  data: { reference: string; status: string; amount: number }
): Promise<{ processed: boolean; message: string }> {
  if (event !== 'charge.success') {
    // For charge.failure, we just log and return.
    if (event === 'charge.failure') {
      const payment = await db.query.payments.findFirst({
        where: eq(payments.gatewayReference, data.reference),
      });
      if (payment && payment.status === 'pending') {
        await db
          .update(payments)
          .set({ status: 'failed' })
          .where(eq(payments.id, payment.id));
      }
    }
    return { processed: true, message: `Event ${event} acknowledged` };
  }

  // For charge.success, verify and credit.
  try {
    await verifyPayment(data.reference);
    return { processed: true, message: 'Payment verified and wallet credited' };
  } catch {
    return { processed: false, message: 'Verification failed — will retry' };
  }
}
