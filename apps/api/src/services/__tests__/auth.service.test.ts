/**
 * Auth Service Tests
 *
 * Integration-style tests for the token-exchange and refresh flows.
 * Firebase Admin SDK and database operations are mocked to isolate
 * the service logic from external dependencies.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ────────────────────────────────────────────────────────────
// Hoisted mock function references
//   vitest hoists `vi.mock` calls above imports, so mock
//   references must also be hoisted via `vi.hoisted`.
// ────────────────────────────────────────────────────────────
const hoisted = vi.hoisted(() => ({
  mockVerifyIdToken: vi.fn(),
  mockFindFirst: vi.fn(),
  mockWalletFindFirst: vi.fn(),
  mockInsert: vi.fn(),
  mockValues: vi.fn(),
  mockReturning: vi.fn(),
  mockIssueAccessToken: vi.fn(),
  mockIssueRefreshToken: vi.fn(),
  mockVerifyRefreshToken: vi.fn(),
}));

// ────────────────────────────────────────────────────────────
// Mock Firebase Admin SDK
// ────────────────────────────────────────────────────────────
vi.mock('../firebase', () => ({
  admin: {
    auth: () => ({
      verifyIdToken: hoisted.mockVerifyIdToken,
    }),
  },
}));

// ────────────────────────────────────────────────────────────
// Mock Drizzle DB
// ────────────────────────────────────────────────────────────
vi.mock('../../db', () => ({
  db: {
    query: {
      users: {
        findFirst: hoisted.mockFindFirst,
      },
      // createWallet() checks for an existing wallet before inserting one —
      // auto-provisioned for every newly created user in exchangeFirebaseToken.
      wallets: {
        findFirst: hoisted.mockWalletFindFirst,
      },
    },
    insert: hoisted.mockInsert,
  },
}));

// ────────────────────────────────────────────────────────────
// Mock JWT middleware
// ────────────────────────────────────────────────────────────
vi.mock('../../middleware/auth', () => ({
  issueAccessToken: hoisted.mockIssueAccessToken,
  issueRefreshToken: hoisted.mockIssueRefreshToken,
  verifyRefreshToken: hoisted.mockVerifyRefreshToken,
}));

// ────────────────────────────────────────────────────────────
// Imports after mocks
// ────────────────────────────────────────────────────────────
import {
  exchangeFirebaseToken,
  refreshAccessToken,
} from '../auth.service';

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/** Build a mock decoded Firebase token for Google social auth. */
function mockGoogleToken() {
  return {
    uid: 'firebase-uid-google-123',
    email: 'user@gmail.com',
    name: 'Test User',
    firebase: { sign_in_provider: 'google.com' },
  };
}

/** Build a mock decoded Firebase token for Phone auth. */
function mockPhoneToken() {
  return {
    uid: 'firebase-uid-phone-456',
    email: null,
    name: null,
    phone_number: '+2348012345678',
    firebase: { sign_in_provider: 'phone' },
  };
}

/** Build a stub existing user record. */
function stubUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-uuid-789',
    authProvider: 'google',
    authProviderId: 'firebase-uid-google-123',
    email: 'user@gmail.com',
    fullName: 'Test User',
    phone: null,
    role: 'user',
    emergencyContacts: [],
    organizationId: null,
    isVerified: true,
    isActive: true,
    notificationPreferences: { pushEnabled: true, emailEnabled: true },
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset mock return chains
  hoisted.mockInsert.mockReturnValue({ values: hoisted.mockValues });
  hoisted.mockValues.mockReturnValue({ returning: hoisted.mockReturning });
  hoisted.mockIssueAccessToken.mockResolvedValue('mock-access-token');
  hoisted.mockIssueRefreshToken.mockResolvedValue('mock-refresh-token');
  // No pre-existing wallet by default — createWallet() proceeds to insert one
  // via the same db.insert(...).values(...).returning() chain used above.
  hoisted.mockWalletFindFirst.mockResolvedValue(null);
});

// ────────────────────────────────────────────────────────────
// exchangeFirebaseToken
// ────────────────────────────────────────────────────────────
describe('exchangeFirebaseToken', () => {
  it('should create a new user on first Google sign-in and return JWT tokens', async () => {
    hoisted.mockVerifyIdToken.mockResolvedValue(mockGoogleToken());
    hoisted.mockFindFirst.mockResolvedValue(null);
    hoisted.mockReturning.mockResolvedValue([stubUser()]);

    const result = await exchangeFirebaseToken('fake-google-id-token');

    expect(hoisted.mockVerifyIdToken).toHaveBeenCalledWith('fake-google-id-token');
    expect(hoisted.mockInsert).toHaveBeenCalled();

    const insertedRow = hoisted.mockValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertedRow.authProvider).toBe('google');
    expect(insertedRow.email).toBe('user@gmail.com');
    expect(insertedRow.fullName).toBe('Test User');
    expect(insertedRow.phone).toBeNull();
    expect(insertedRow.role).toBe('user');

    expect(hoisted.mockIssueAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'user-uuid-789', email: 'user@gmail.com', role: 'user' })
    );
    expect(hoisted.mockIssueRefreshToken).toHaveBeenCalledWith({ sub: 'user-uuid-789' });

    expect(result.accessToken).toBe('mock-access-token');
    expect(result.refreshToken).toBe('mock-refresh-token');
    expect(result.user.isNew).toBe(true);
    expect(result.user.email).toBe('user@gmail.com');
  });

  it('should create a user via Phone auth with phone pre-populated from token', async () => {
    hoisted.mockVerifyIdToken.mockResolvedValue(mockPhoneToken());
    hoisted.mockFindFirst.mockResolvedValue(null);
    hoisted.mockReturning.mockResolvedValue([stubUser({
      authProvider: 'phone',
      authProviderId: 'firebase-uid-phone-456',
      email: 'phone_firebase-uid-phone-456@user.safepass',
      fullName: 'User',
      phone: '+2348012345678',
    })]);

    const result = await exchangeFirebaseToken('fake-phone-id-token');

    const insertedRow = hoisted.mockValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertedRow.authProvider).toBe('phone');
    expect(insertedRow.phone).toBe('+2348012345678');
    expect(insertedRow.email).toContain('@user.safepass');

    expect(result.user.phone).toBe('+2348012345678');
    expect(result.user.isNew).toBe(true);
  });

  it('should return existing user on repeat sign-in (not isNew)', async () => {
    hoisted.mockVerifyIdToken.mockResolvedValue(mockGoogleToken());
    hoisted.mockFindFirst.mockResolvedValue(stubUser());

    const result = await exchangeFirebaseToken('fake-google-id-token');

    expect(hoisted.mockInsert).not.toHaveBeenCalled();
    expect(result.user.isNew).toBe(false);
    expect(result.user.email).toBe('user@gmail.com');
  });

  it('should throw when Firebase token verification fails', async () => {
    hoisted.mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

    await expect(
      exchangeFirebaseToken('bad-token')
    ).rejects.toThrow('Invalid token');
  });

  it('should map Facebook provider correctly', async () => {
    hoisted.mockVerifyIdToken.mockResolvedValue({
      uid: 'fb-uid',
      email: 'fbuser@gmail.com',
      name: 'FB User',
      firebase: { sign_in_provider: 'facebook.com' },
    });
    hoisted.mockFindFirst.mockResolvedValue(null);
    hoisted.mockReturning.mockResolvedValue([stubUser({ authProvider: 'facebook', authProviderId: 'fb-uid' })]);

    await exchangeFirebaseToken('fake-fb-id-token');

    const insertedRow = hoisted.mockValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertedRow.authProvider).toBe('facebook');
  });
});

// ────────────────────────────────────────────────────────────
// refreshAccessToken
// ────────────────────────────────────────────────────────────
describe('refreshAccessToken', () => {
  it('should return new token pair for a valid refresh token', async () => {
    hoisted.mockVerifyRefreshToken.mockResolvedValue('user-uuid-789');
    hoisted.mockFindFirst.mockResolvedValue(stubUser());

    const result = await refreshAccessToken('valid-refresh-token');

    expect(hoisted.mockVerifyRefreshToken).toHaveBeenCalledWith('valid-refresh-token');
    expect(hoisted.mockIssueAccessToken).toHaveBeenCalled();
    expect(hoisted.mockIssueRefreshToken).toHaveBeenCalled();
    expect(result.accessToken).toBe('mock-access-token');
    expect(result.refreshToken).toBe('mock-refresh-token');
  });

  it('should throw when refresh token verification fails', async () => {
    hoisted.mockVerifyRefreshToken.mockRejectedValue(new Error('Invalid refresh token'));

    await expect(
      refreshAccessToken('bad-refresh-token')
    ).rejects.toThrow('Invalid refresh token');
  });

  it('should throw when user is not found', async () => {
    hoisted.mockVerifyRefreshToken.mockResolvedValue('user-uuid-789');
    hoisted.mockFindFirst.mockResolvedValue(null);

    await expect(
      refreshAccessToken('valid-refresh-token')
    ).rejects.toThrow('User not found or inactive');
  });

  it('should throw when user is inactive', async () => {
    hoisted.mockVerifyRefreshToken.mockResolvedValue('user-uuid-789');
    hoisted.mockFindFirst.mockResolvedValue(stubUser({ isActive: false }));

    await expect(
      refreshAccessToken('valid-refresh-token')
    ).rejects.toThrow('User not found or inactive');
  });
});
