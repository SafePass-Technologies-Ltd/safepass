/**
 * T-055: the two Firebase classification holes QA found in the C-001 work.
 *
 * WHAT WAS BROKEN
 *
 * C-001's classifier answered 401 for anything firebase-admin reported as an
 * `auth/...` failure unless the code was a known Firebase-side one. Two codes
 * were missing from that set, and both of them mean "the server is broken", not
 * "this user's token is bad":
 *
 *   - `auth/invalid-credential`: raised by `ensureProjectId` when the SDK cannot
 *     resolve a project id at all -- our service-account configuration. No
 *     user's token can ever satisfy it, so every 401 it produced was a
 *     permanent sign-in loop against a server that would never accept anyone.
 *
 *   - `auth/argument-error`: the code a JWKS/certificate fetch failure is
 *     mapped to, because `mapJwtErrorToAuthError` has no branch for
 *     `key-fetch-error` and falls through to `INVALID_ARGUMENT`. So when
 *     Google's key endpoint was unreachable, every user was told to sign in
 *     again -- the exact Google-outage-as-logout failure this classification
 *     exists to prevent. The same code legitimately covers malformed tokens,
 *     so it cannot be split on the code alone.
 *
 * HOW THE SECOND ONE IS SPLIT
 *
 * This was investigated against firebase-admin 13.4.0's actual source, not
 * guessed at (see `KEY_FETCH_FAILURE_MARKERS` in `auth.routes.ts`): the
 * underlying `JwtError` is discarded, `error.cause` is never set, and the JWT
 * error code is gone -- but the key-fetch reason survives verbatim in the
 * message, prefixed by one of two exact phrases that firebase-admin's own
 * HttpClient/UrlKeyFetcher produces. No token-defect message contains either
 * phrase. These tests pin that boundary in both directions, with the real
 * firebase-admin error objects and messages.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { FirebaseAuthError } from 'firebase-admin/auth';

const hoisted = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  usersFindFirst: vi.fn(),
}));

vi.mock('../../services/firebase', () => ({
  admin: { auth: () => ({ verifyIdToken: hoisted.verifyIdToken }) },
}));

vi.mock('../../db', () => ({
  db: {
    query: { users: { findFirst: hoisted.usersFindFirst } },
    insert: vi.fn(),
  },
}));

vi.mock('../../services/wallet.service', () => ({ createWallet: vi.fn() }));

vi.mock('../../middleware/auth', () => ({
  issueAccessToken: vi.fn().mockResolvedValue('access-token'),
  issueRefreshToken: vi.fn().mockResolvedValue('refresh-token'),
  verifyRefreshToken: vi.fn(),
}));

import { authRoutes } from '../auth.routes';
import { errorHandler } from '../../middleware/error';

const app = new Hono();
app.onError(errorHandler);
app.route('/v1/auth', authRoutes);

const FIREBASE_ID_TOKEN = 'never-log-this-token';

/** `FirebaseAuthError`'s published typing hides the `{ code, message }` constructor. */
const FirebaseAuthErrorCtor = FirebaseAuthError as unknown as new (info: {
  code: string;
  message: string;
}) => FirebaseAuthError;

/**
 * The error `verifyIdToken` actually throws, built through firebase-admin's own
 * constructor: the `auth/` prefix, the getter-backed `code`, the message.
 */
function firebaseAuthError(code: string, message = `verifyIdToken failed (${code})`) {
  return new FirebaseAuthErrorCtor({ code, message });
}

async function exchange(): Promise<Response> {
  return app.request('/v1/auth/token-exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': 'req-t055' },
    body: JSON.stringify({ firebaseIdToken: FIREBASE_ID_TOKEN }),
  });
}

function existingUser() {
  return {
    id: '6f1d2c3b-4a59-4e8f-9b7a-1c2d3e4f5a6b',
    authProvider: 'google',
    authProviderId: 'firebase-uid-1',
    email: 'traveller@example.com',
    fullName: 'Ada Traveller',
    phone: null,
    role: 'user',
    organizationId: null,
    emergencyContacts: [],
    isVerified: true,
    isActive: true,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  };
}

function loggedFailure(): Record<string, unknown> {
  const line = vi
    .mocked(console.error)
    .mock.calls.map(([entry]) => String(entry))
    .find((entry) => entry.includes('token_exchange_failed'));
  expect(line).toBeDefined();
  return JSON.parse(line as string) as Record<string, unknown>;
}

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  process.env.NODE_ENV = 'production';

  hoisted.usersFindFirst.mockResolvedValue(existingUser());
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe('T-055: auth/invalid-credential is a server misconfiguration', () => {
  it('answers 500, not 401, when the Firebase project id cannot be resolved', async () => {
    // Verbatim from `FirebaseTokenVerifier.ensureProjectId` (firebase-admin
    // 13.4.0): this is what a missing/incorrect service account produces.
    hoisted.verifyIdToken.mockRejectedValue(
      firebaseAuthError(
        'invalid-credential',
        'Must initialize app with a cert credential or set your Firebase project ID as the ' +
          'GOOGLE_CLOUD_PROJECT environment variable to call verifyIdToken().'
      )
    );

    const res = await exchange();

    // A 401 here sends the whole user base into a sign-in loop against a server
    // that cannot verify anybody.
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: { code: 500, message: 'Internal server error' } });

    const entry = loggedFailure();
    expect(entry.stage).toBe('firebase');
    expect(entry.code).toBe('auth/invalid-credential');
  });
});

describe('T-055: a JWKS fetch failure is not a bad token', () => {
  /**
   * The two messages firebase-admin produces when it cannot get Google's
   * signing keys. Both were traced through the SDK's own source: the JWT error
   * code is discarded by `mapJwtErrorToAuthError`, and only the message
   * survives.
   */
  const keyFetchFailures: Array<[string, string]> = [
    [
      'an HTTP error from Google',
      // `UrlKeyFetcher.refresh` wraps a non-2xx / error payload like this.
      'Error fetching public keys for Google certs: Server responded with status 503.',
    ],
    [
      'a DNS or socket failure',
      // firebase-admin's `HttpClient` wraps transport errors like this.
      'Error while making request: getaddrinfo EAI_AGAIN www.googleapis.com. Error code: EAI_AGAIN',
    ],
    [
      'a connect timeout',
      'Error while making request: connect ETIMEDOUT 142.250.187.74:443. Error code: ETIMEDOUT',
    ],
  ];

  it.each(keyFetchFailures)(
    'answers 500 -- not 401 -- for %s',
    async (_label, message) => {
      hoisted.verifyIdToken.mockRejectedValue(firebaseAuthError('argument-error', message));

      const res = await exchange();

      // This is the Google-outage case the Firebase-side set exists to catch:
      // sign-in is impossible for everyone, and no amount of signing in again
      // fixes it.
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: { code: 500, message: 'Internal server error' } });

      const entry = loggedFailure();
      expect(entry.stage).toBe('firebase');
      expect(entry.code).toBe('auth/argument-error');
    }
  );
});

describe('T-055: auth/argument-error still means 401 for an actual bad token', () => {
  /**
   * Messages firebase-admin authors itself. Each one is a token the caller
   * cannot use, and every one must stay a 401 -- the whole point of splitting
   * the code rather than blanket-classifying it.
   */
  const badTokens: Array<[string, string]> = [
    [
      'a malformed JWT',
      'Decoding Firebase ID token failed. Make sure you passed the entire string JWT which ' +
        'represents a Firebase ID token. See https://firebase.google.com/docs/auth/admin/' +
        'verify-id-tokens for details on how to retrieve an ID token.',
    ],
    [
      'an invalid signature',
      'Firebase ID token has invalid signature. See https://firebase.google.com/docs/auth/' +
        'admin/verify-id-tokens for details on how to retrieve an ID token.',
    ],
    [
      'an unknown key id',
      'Firebase ID token has "kid" claim which does not correspond to a known public key. Most ' +
        'likely the ID token is expired, so get a fresh token from your client app and try ' +
        'again.',
    ],
    [
      'the wrong audience',
      'Firebase ID token has incorrect "aud" (audience) claim. Expected "safepass-production" ' +
        'but got "someone-else".',
    ],
    [
      'a token from another project',
      'Firebase ID token has incorrect "iss" (issuer) claim. Expected ' +
        '"https://securetoken.google.com/safepass-production" but got ' +
        '"https://securetoken.google.com/other".',
    ],
    ['an empty argument', 'Invalid argument provided.'],
  ];

  it.each(badTokens)('answers 401 with the frozen body for %s', async (_label, message) => {
    hoisted.verifyIdToken.mockRejectedValue(firebaseAuthError('argument-error', message));

    const res = await exchange();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 401, message: 'Invalid Firebase ID token' },
    });
    // Expected traffic: no incident log line.
    expect(console.error).not.toHaveBeenCalled();
  });

  it('still answers 401 when a claim echoes a key-fetch phrase back at us', async () => {
    // firebase-admin interpolates decoded claim values into its messages, so a
    // crafted token can put "Error fetching public keys..." in the middle of a
    // token-defect message. The key-fetch match is anchored to the start of the
    // message precisely so that cannot be read as an outage: a hostile token
    // must not be able to make its own rejection look like our failure.
    hoisted.verifyIdToken.mockRejectedValue(
      firebaseAuthError(
        'argument-error',
        'Firebase ID token has incorrect "aud" (audience) claim. Expected ' +
          '"safepass-production" but got "Error while making request: getaddrinfo EAI_AGAIN". ' +
          'See https://firebase.google.com/docs/auth/admin/verify-id-tokens for details.'
      )
    );

    const res = await exchange();

    expect(res.status).toBe(401);
  });
});

describe('T-055: no regression in the codes that already worked', () => {
  it.each(['id-token-expired', 'id-token-revoked', 'invalid-id-token', 'user-disabled'])(
    'keeps answering 401 for %s',
    async (code) => {
      hoisted.verifyIdToken.mockRejectedValue(firebaseAuthError(code));

      const res = await exchange();

      expect(res.status).toBe(401);
    }
  );

  it.each(['internal-error', 'insufficient-permission'])(
    'keeps answering 500 for %s',
    async (code) => {
      hoisted.verifyIdToken.mockRejectedValue(firebaseAuthError(code));

      const res = await exchange();

      expect(res.status).toBe(500);
      expect(loggedFailure().code).toBe(`auth/${code}`);
    }
  );
});
