/**
 * T-055 / C-001: the `auth/argument-error` boundary, proven against
 * firebase-admin itself.
 *
 * WHY THIS FILE EXISTS (and how it differs from the committed T-055 tests)
 *
 * `auth.t055-firebase-classification.test.ts` proves the *routing*: given an
 * error whose code is `auth/argument-error` and whose message starts with one
 * of two phrases, answer 500; otherwise 401. What it cannot prove is that
 * firebase-admin ever produces those messages -- it fabricates both the code
 * and the text. That is the whole risk of a message-prefix match: if the SDK
 * changes its wording, the fabricated tests keep passing and production quietly
 * goes back to telling every user to sign in during a Google outage.
 *
 * So this file builds the real `FirebaseTokenVerifier` from the installed
 * firebase-admin, points its certificate endpoint at things that fail the two
 * ways Google can fail, and feeds the *resulting error objects* to the real
 * route. It asserts the boundary in both directions, with the library doing the
 * talking:
 *
 *   1. a 503 from the cert endpoint          -> key-fetch phrase -> 500
 *   2. a refused connection to the cert host -> key-fetch phrase -> 500
 *   3. a token with a marker planted in a claim (aud, iss, kid) -> 401
 *
 * (3) is the security boundary: a hostile token must not be able to style its
 * own rejection as our outage, because a 500 turns "your token is bad" into
 * "retry forever". It holds because the marker phrases are only ever *prefixed*
 * by firebase-admin's own key-fetch layer -- claim values are interpolated into
 * the middle of token-defect messages, never at position 0.
 *
 * NOTE ON THE IMPORT: `FirebaseTokenVerifier` is not in firebase-admin's exports
 * map (`@internal`). It is reached through `createRequire` on the installed
 * file. If a future SDK moves that file, this test fails loudly at collection
 * time rather than silently passing -- which is the correct failure mode for
 * a boundary this sharp.
 */
import { createRequire } from 'node:module';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { SignJWT, generateKeyPair } from 'jose';

/** Narrow shape of the SDK-internal class this file drives. */
interface RealTokenVerifier {
  verifyJWT(token: string): Promise<unknown>;
}

const requireInternal = createRequire(import.meta.url);
const firebaseAdminRoot = requireInternal
  .resolve('firebase-admin')
  .replace(/[\\/]lib[\\/]index\.js$/, '/');
const { FirebaseTokenVerifier } = requireInternal(
  `${firebaseAdminRoot}lib/auth/token-verifier.js`
) as {
  FirebaseTokenVerifier: new (
    clientCertUrl: string,
    issuer: string,
    tokenInfo: Record<string, unknown>,
    app: unknown
  ) => RealTokenVerifier;
};

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

/** Mirrors firebase-admin's own `ID_TOKEN_INFO`. */
const ID_TOKEN_INFO = {
  url: 'https://firebase.google.com/docs/auth/admin/verify-id-tokens',
  verifyApiName: 'verifyIdToken()',
  jwtName: 'Firebase ID token',
  shortName: 'ID token',
  expiredErrorCode: { code: 'id-token-expired', message: '' },
};

const ISSUER = 'https://securetoken.google.com/';
const PROJECT_ID = 'safepass-production';

/** Stand-in for the FirebaseApp: only `projectId` and `httpAgent` are read. */
const fakeApp = { name: '[DEFAULT]', options: { projectId: PROJECT_ID } };

function verifierAgainst(certUrl: string): RealTokenVerifier {
  return new FirebaseTokenVerifier(certUrl, ISSUER, ID_TOKEN_INFO, fakeApp);
}

/** A 503 from the certificate endpoint: Google having a bad day. */
let certServer: Server;
let certServerPort: number;
// jose 6 signs with the WebCrypto key the pair generator returns.
let rsaKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

beforeAll(async () => {
  certServer = createServer((_req, res) => {
    res.writeHead(503, { 'content-type': 'text/plain' });
    res.end('certs are unavailable');
  });
  await new Promise<void>((resolve) => certServer.listen(0, '127.0.0.1', resolve));
  certServerPort = (certServer.address() as AddressInfo).port;

  // A real RS256 key pair. It is not Google's, which is exactly the point: the
  // verifier only has to reach the signature-verification stage to attempt the
  // key fetch we are measuring.
  const pair = await generateKeyPair('RS256');
  rsaKey = pair.privateKey;
});

afterAll(async () => {
  await new Promise<void>((resolve) => certServer.close(() => resolve()));
});

/**
 * A structurally valid ID token signed with our own RS256 key. `kid` is present
 * so the verifier goes looking for the corresponding certificate.
 */
function idToken(claims: Record<string, unknown> = {}): Promise<string> {
  return new SignJWT({
    aud: PROJECT_ID,
    iss: `${ISSUER}${PROJECT_ID}`,
    sub: 'firebase-uid-1',
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'a-kid-the-attacker-chose' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(rsaKey);
}

async function exchange(): Promise<Response> {
  return app.request('/v1/auth/token-exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ firebaseIdToken: 'the-token-the-verifier-sees' }),
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

describe('T-055: real key-fetch failures reach the 500 side', () => {
  // firebase-admin retries a 5xx from the cert endpoint with exponential
  // backoff (1s + 2s + 4s), so a single failed fetch costs ~7s. That is the
  // library's own behaviour, not the test's, hence the explicit budget.
  const CERT_FETCH_BUDGET_MS = 25_000;

  it(
    'answers 500 when Google cert endpoint returns 503',
    async () => {
      const verifier = verifierAgainst(`http://127.0.0.1:${certServerPort}/linux/secret`);
      hoisted.verifyIdToken.mockImplementation(async () => {
        await verifier.verifyJWT(await idToken());
      });

      const res = await exchange();

      // Every user is unable to sign in, and no amount of retrying fixes it.
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: { code: 500, message: 'Internal server error' },
      });

      const line = vi
        .mocked(console.error)
        .mock.calls.map(([entry]) => String(entry))
        .find((entry) => entry.includes('token_exchange_failed'));
      expect(line).toBeDefined();
      const logged = JSON.parse(line as string) as Record<string, unknown>;
      expect(logged.stage).toBe('firebase');
      expect(logged.code).toBe('auth/argument-error');
      expect(String(logged.message)).toContain('Error fetching public keys for Google certs');
    },
    CERT_FETCH_BUDGET_MS
  );

  it('answers 500 when the cert host cannot be reached at all', async () => {
    // Port 9 (discard) is closed here, which is the DNS/socket case: the SDK's
    // HttpClient wraps it as "Error while making request: ...".
    const verifier = verifierAgainst('http://127.0.0.1:9/linux/secret');
    hoisted.verifyIdToken.mockImplementation(async () => {
      await verifier.verifyJWT(await idToken());
    });

    const res = await exchange();

    expect(res.status).toBe(500);

    const line = vi
      .mocked(console.error)
      .mock.calls.map(([entry]) => String(entry))
      .find((entry) => entry.includes('token_exchange_failed'));
    const logged = JSON.parse(line as string) as Record<string, unknown>;
    expect(logged.code).toBe('auth/argument-error');
    expect(String(logged.message)).toContain('Error while making request');
  });
});

describe('T-055: a hostile token cannot style its rejection as an outage', () => {
  /**
   * Each claim below carries one of the marker phrases the classifier trusts.
   * The verifier interpolates claim values into its messages, so this is the
   * exact smuggling path the anchoring exists to close: if the match were
   * `includes` rather than `startsWith`, every one of these would answer 500 and
   * a bad token would become "retry forever".
   */
  const smuggled = [
    ['audience', { aud: 'Error fetching public keys for Google certs: injected' }],
    ['issuer', { iss: 'Error while making request: injected' }],
  ] as const;

  it.each(smuggled)('answers 401 for a marker smuggled into the %s claim', async (_label, claims) => {
    const verifier = verifierAgainst(`http://127.0.0.1:${certServerPort}/linux/secret`);
    hoisted.verifyIdToken.mockImplementation(async () => {
      await verifier.verifyJWT(await idToken(claims));
    });

    const res = await exchange();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 401, message: 'Invalid Firebase ID token' },
    });
  });

  it('answers 401 for a marker planted in the `kid` header', async () => {
    // `kid` is attacker-chosen and is only compared against the fetched key
    // set -- it never becomes part of a message. To show that, the key fetch is
    // made to fail (dead port, instant refusal) so the *only* thing that can
    // colour the message is the transport phrase, not the `kid`.
    const verifier = verifierAgainst('http://127.0.0.1:9/linux/secret');
    hoisted.verifyIdToken.mockImplementation(async () => {
      const token = await new SignJWT({
        aud: PROJECT_ID,
        iss: `${ISSUER}${PROJECT_ID}`,
        sub: 'firebase-uid-1',
      })
        .setProtectedHeader({
          alg: 'RS256',
          kid: 'Error fetching public keys for Google certs: injected',
        })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(rsaKey);
      await verifier.verifyJWT(token);
    });

    const res = await exchange();

    // 500 is correct because the cert endpoint failed, and the message proves
    // the attacker's string was never promoted to the prefix.
    expect(res.status).toBe(500);
    const line = vi
      .mocked(console.error)
      .mock.calls.map(([entry]) => String(entry))
      .find((entry) => entry.includes('token_exchange_failed'));
    const logged = JSON.parse(line as string) as Record<string, unknown>;
    expect(String(logged.message)).toContain('Error while making request');
    expect(String(logged.message)).not.toContain('certs: injected');
  });

  it('answers 401 for a garbage string, which decodes before any fetch', async () => {
    const verifier = verifierAgainst(`http://127.0.0.1:${certServerPort}/linux/secret`);
    hoisted.verifyIdToken.mockImplementation(() => verifier.verifyJWT('not-a-jwt'));

    const res = await exchange();

    expect(res.status).toBe(401);
  });
});

describe('T-055: the SDK still answers 401 for ordinary token defects', () => {
  it('answers 401 for a token with no kid claim', async () => {
    const verifier = verifierAgainst(`http://127.0.0.1:${certServerPort}/linux/secret`);
    hoisted.verifyIdToken.mockImplementation(async () => {
      const token = await new SignJWT({
        aud: PROJECT_ID,
        iss: `${ISSUER}${PROJECT_ID}`,
        sub: 'firebase-uid-1',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode('x'.repeat(48)));
      await verifier.verifyJWT(token);
    });

    const res = await exchange();

    expect(res.status).toBe(401);
  });
});

