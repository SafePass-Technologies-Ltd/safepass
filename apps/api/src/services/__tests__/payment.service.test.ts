/**
 * Payment Service Tests — T-026 (payment webhook must validate the gateway
 * signature).
 *
 * Unit tests for `verifyPaystackWebhookSignature`: HMAC-SHA512 over the raw
 * body with the gateway secret, constant-time comparison, fail-closed on
 * missing secret/header. The route-level "bad rejected / valid processed"
 * behaviour is covered by routes/__tests__/payment.routes.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';

vi.mock('../../db', () => ({
  db: {
    query: {
      payments: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
}));

// payment.service imports env only as a module binding; no module-scope reads.
vi.mock('../../env', () => ({
  env: {},
}));

import { verifyPaystackWebhookSignature } from '../payment.service';

const TEST_SECRET = 'sk_test_document-upload-verification-secret';

/** Compute the exact signature Paystack would send for a given raw body. */
function sign(body: string, secret: string = TEST_SECRET): string {
  return createHmac('sha512', secret).update(body).digest('hex');
}

const RAW_BODY = JSON.stringify({
  event: 'charge.success',
  data: { reference: 'SP-ABC123', status: 'success', amount: 2000 },
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PAYSTACK_SECRET_KEY = TEST_SECRET;
});

afterEach(() => {
  delete process.env.PAYSTACK_SECRET_KEY;
});

describe('verifyPaystackWebhookSignature', () => {
  it('accepts a signature computed over the exact raw body', () => {
    expect(verifyPaystackWebhookSignature(RAW_BODY, sign(RAW_BODY))).toBe(true);
  });

  it('rejects a signature computed with a different secret', () => {
    expect(verifyPaystackWebhookSignature(RAW_BODY, sign(RAW_BODY, 'sk_test_wrong-secret'))).toBe(
      false
    );
  });

  it('rejects a request whose body was tampered with after signing', () => {
    const tampered = RAW_BODY.replace('2000', '99999');
    expect(verifyPaystackWebhookSignature(tampered, sign(RAW_BODY))).toBe(false);
  });

  it('rejects a missing signature header (fail closed)', () => {
    expect(verifyPaystackWebhookSignature(RAW_BODY, undefined)).toBe(false);
    expect(verifyPaystackWebhookSignature(RAW_BODY, null)).toBe(false);
  });

  it('rejects an empty signature header (fail closed)', () => {
    expect(verifyPaystackWebhookSignature(RAW_BODY, '')).toBe(false);
  });

  it('rejects a non-hex signature instead of throwing (fail closed)', () => {
    expect(verifyPaystackWebhookSignature(RAW_BODY, 'not-a-valid-hex-signature!')).toBe(false);
  });

  it('fails closed when the gateway secret is not configured', () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    expect(verifyPaystackWebhookSignature(RAW_BODY, sign(RAW_BODY))).toBe(false);
  });

  it('produces different signatures for different bodies (no cross-body reuse)', () => {
    const otherBody = JSON.stringify({
      event: 'charge.failure',
      data: { reference: 'SP-ABC123', status: 'failed', amount: 2000 },
    });
    expect(sign(otherBody)).not.toBe(sign(RAW_BODY));
  });
});