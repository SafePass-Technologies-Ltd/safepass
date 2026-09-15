/**
 * Payment Webhook Route Tests — T-026 (payment webhook must validate the
 * gateway signature).
 *
 * Route-level proof for POST /v1/payments/webhook: an unverified request is
 * rejected with 401 and never reaches the payment handler; a request with a
 * valid HMAC-SHA512 `x-paystack-signature` is processed. The real
 * `verifyPaystackWebhookSignature` is exercised (via importOriginal); only
 * `handlePaystackWebhook` is mocked so we can assert processing without a DB.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { Hono } from 'hono';

const hoisted = vi.hoisted(() => ({
  mockHandleWebhook: vi.fn(),
  mockInitializePayment: vi.fn(),
  mockVerifyPayment: vi.fn(),
}));

vi.mock('../../env', () => ({
  env: {
    NODE_ENV: 'test',
    PAYSTACK_FALLBACK_EMAIL: 'support@safepass-tech.com',
  },
}));

vi.mock('../../db', () => ({
  db: {},
}));

vi.mock('../middleware/auth', () => ({
  authMiddleware: async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../services/auth.service', () => ({
  PLACEHOLDER_EMAIL_DOMAIN: '@user.safepass',
}));

// Keep the REAL verifyPaystackWebhookSignature; mock only the DB-touching
// handlers so the route test can assert "processed" without a database.
vi.mock('../../services/payment.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/payment.service')>();
  return {
    ...actual,
    initializePayment: hoisted.mockInitializePayment,
    verifyPayment: hoisted.mockVerifyPayment,
    handlePaystackWebhook: hoisted.mockHandleWebhook,
  };
});

import { paymentRoutes } from '../payment.routes';

const app = new Hono();
app.route('/v1/payments', paymentRoutes);

const TEST_SECRET = 'sk_test_route-webhook-verification-secret';
const RAW_BODY = JSON.stringify({
  event: 'charge.success',
  data: { reference: 'SP-ABC123', status: 'success', amount: 2000 },
});

function sign(body: string, secret: string = TEST_SECRET): string {
  return createHmac('sha512', secret).update(body).digest('hex');
}

async function postWebhook(body: string, signature?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature !== undefined) headers['x-paystack-signature'] = signature;
  return app.request('/v1/payments/webhook', {
    method: 'POST',
    headers,
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PAYSTACK_SECRET_KEY = TEST_SECRET;
  hoisted.mockHandleWebhook.mockResolvedValue({
    processed: true,
    message: 'Payment verified and wallet credited',
  });
});

afterEach(() => {
  delete process.env.PAYSTACK_SECRET_KEY;
});

describe('POST /v1/payments/webhook', () => {
  it('rejects a request with a missing signature header (401) and does not process it', async () => {
    const res = await postWebhook(RAW_BODY);

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: number } };
    expect(body.error.code).toBe(401);
    expect(hoisted.mockHandleWebhook).not.toHaveBeenCalled();
  });

  it('rejects a request with an invalid signature (401) and does not process it', async () => {
    const res = await postWebhook(RAW_BODY, 'deadbeef-invalid-signature');

    expect(res.status).toBe(401);
    expect(hoisted.mockHandleWebhook).not.toHaveBeenCalled();
  });

  it('rejects a forged request whose body was tampered with after signing (401)', async () => {
    const tampered = RAW_BODY.replace('2000', '99999');
    const res = await postWebhook(tampered, sign(RAW_BODY));

    expect(res.status).toBe(401);
    expect(hoisted.mockHandleWebhook).not.toHaveBeenCalled();
  });

  it('processes a request with a valid signature (200) and forwards the parsed event', async () => {
    const res = await postWebhook(RAW_BODY, sign(RAW_BODY));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
    expect(hoisted.mockHandleWebhook).toHaveBeenCalledTimes(1);
    expect(hoisted.mockHandleWebhook).toHaveBeenCalledWith(
      'charge.success',
      { reference: 'SP-ABC123', status: 'success', amount: 2000 }
    );
  });

  it('returns 400 for a validly-signed body that is not valid JSON (defensive)', async () => {
    const res = await postWebhook('not json at all', sign('not json at all'));

    expect(res.status).toBe(400);
    expect(hoisted.mockHandleWebhook).not.toHaveBeenCalled();
  });
});