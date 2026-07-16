/**
 * Account Deletion Service Tests — M-38 / A-27.
 *
 * Focuses on the safety-critical logic: pre-flight blocking checks (active
 * trip, wallet balance/forfeiture, sole org admin, generic org membership)
 * and the legal-hold detection used by both the sweep job and force-delete,
 * per the coordinator's emphasis on not guessing silently on
 * safety/legal-hold-related behaviour. Follows the same mock-the-database
 * approach as auth.service.test.ts / trip-archive.service.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  mockUserFindFirst: vi.fn(),
  mockUsersFindFirstOther: vi.fn(), // second call to users.findFirst (other-admin check)
  mockTripFindFirst: vi.fn(),
  mockTripsFindMany: vi.fn(),
  mockOrgFindFirst: vi.fn(),
  mockDeletionRequestFindFirst: vi.fn(),
  mockDeletionRequestFindMany: vi.fn(),
  mockIncidentsFindMany: vi.fn(),
  mockEmergencyEventsFindMany: vi.fn(),
  mockEscalationsFindMany: vi.fn(),
  mockInsert: vi.fn(),
  mockInsertValues: vi.fn(),
  mockInsertReturning: vi.fn(),
  mockUpdate: vi.fn(),
  mockUpdateSet: vi.fn(),
  mockUpdateWhere: vi.fn(),
  mockUpdateReturning: vi.fn(),
  mockTransaction: vi.fn(),
  mockGetWallet: vi.fn(),
}));

vi.mock('../../db', () => ({
  db: {
    query: {
      users: { findFirst: hoisted.mockUserFindFirst },
      trips: { findFirst: hoisted.mockTripFindFirst, findMany: hoisted.mockTripsFindMany },
      organizations: { findFirst: hoisted.mockOrgFindFirst },
      accountDeletionRequests: {
        findFirst: hoisted.mockDeletionRequestFindFirst,
        findMany: hoisted.mockDeletionRequestFindMany,
      },
      incidents: { findMany: hoisted.mockIncidentsFindMany },
      emergencyEvents: { findMany: hoisted.mockEmergencyEventsFindMany },
      escalations: { findMany: hoisted.mockEscalationsFindMany },
    },
    insert: hoisted.mockInsert,
    update: hoisted.mockUpdate,
    transaction: hoisted.mockTransaction,
  },
}));

vi.mock('../wallet.service', () => ({
  getWallet: hoisted.mockGetWallet,
}));

// Bypasses env.ts's real startup validation (DATABASE_URL, JWT secrets, etc.),
// which isn't set in CI's test job — only the two constants this service
// actually reads are needed here, mirroring the schema's own defaults.
vi.mock('../../env', () => ({
  env: {
    ACCOUNT_DELETION_WALLET_FORFEIT_THRESHOLD_NGN: 500,
    ACCOUNT_DELETION_COOLING_OFF_DAYS: 14,
  },
}));

import {
  createDeletionRequest,
  cancelDeletionRequest,
  checkLegalHold,
  overrideLegalHold,
  forceDeleteUser,
} from '../account-deletion.service';

/** Build a stub user row with sane defaults. */
function stubUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    organizationId: null,
    role: 'user',
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  hoisted.mockInsert.mockReturnValue({ values: hoisted.mockInsertValues });
  hoisted.mockInsertValues.mockReturnValue({ returning: hoisted.mockInsertReturning });

  hoisted.mockUpdate.mockReturnValue({ set: hoisted.mockUpdateSet });
  hoisted.mockUpdateSet.mockReturnValue({ where: hoisted.mockUpdateWhere });
  hoisted.mockUpdateWhere.mockReturnValue({ returning: hoisted.mockUpdateReturning });

  // No prior deletion request, no active trip, no org, empty wallet by default.
  hoisted.mockDeletionRequestFindFirst.mockResolvedValue(null);
  hoisted.mockTripFindFirst.mockResolvedValue(null);
  hoisted.mockTripsFindMany.mockResolvedValue([]);
  hoisted.mockOrgFindFirst.mockResolvedValue(null);
  hoisted.mockGetWallet.mockResolvedValue(null);
  hoisted.mockIncidentsFindMany.mockResolvedValue([]);
  hoisted.mockEmergencyEventsFindMany.mockResolvedValue([]);
  hoisted.mockEscalationsFindMany.mockResolvedValue([]);
});

// ────────────────────────────────────────────────────────────
// createDeletionRequest — pre-flight checks
// ────────────────────────────────────────────────────────────
describe('createDeletionRequest', () => {
  it('rejects when the user has an active trip', async () => {
    hoisted.mockUserFindFirst.mockResolvedValue(stubUser());
    hoisted.mockTripFindFirst.mockResolvedValue({ id: 'trip-1' }); // active trip exists

    await expect(
      createDeletionRequest({ userId: 'user-1', forfeitWalletBalance: false })
    ).rejects.toThrow('Complete or cancel your active trip');

    expect(hoisted.mockInsert).not.toHaveBeenCalled();
  });

  it('rejects when wallet balance exceeds the forfeiture threshold', async () => {
    hoisted.mockUserFindFirst.mockResolvedValue(stubUser());
    hoisted.mockGetWallet.mockResolvedValue({ balance: 5000 }); // above default 500 threshold

    await expect(
      createDeletionRequest({ userId: 'user-1', forfeitWalletBalance: false })
    ).rejects.toThrow('Request a refund via support');
  });

  it('rejects a sub-threshold wallet balance unless explicitly forfeited', async () => {
    hoisted.mockUserFindFirst.mockResolvedValue(stubUser());
    hoisted.mockGetWallet.mockResolvedValue({ balance: 200 }); // below default 500 threshold

    await expect(
      createDeletionRequest({ userId: 'user-1', forfeitWalletBalance: false })
    ).rejects.toThrow('forfeit my remaining balance');
  });

  it('allows a sub-threshold wallet balance when explicitly forfeited', async () => {
    hoisted.mockUserFindFirst.mockResolvedValue(stubUser());
    hoisted.mockGetWallet.mockResolvedValue({ balance: 200 });
    hoisted.mockInsertReturning.mockResolvedValue([{ id: 'req-1', status: 'pending' }]);

    const result = await createDeletionRequest({ userId: 'user-1', forfeitWalletBalance: true });

    expect(result).toEqual({ id: 'req-1', status: 'pending' });
    const insertedRow = hoisted.mockInsertValues.mock.calls[0]?.[0] as Record<string, unknown>;
    expect((insertedRow.preFlightChecks as Record<string, unknown>).walletForfeited).toBe(true);
  });

  it('rejects a sole corporate_admin of an active org', async () => {
    hoisted.mockUserFindFirst.mockResolvedValue(
      stubUser({ organizationId: 'org-1', role: 'corporate_admin' })
    );
    hoisted.mockOrgFindFirst.mockResolvedValue({ id: 'org-1', isActive: true });
    // No other admin found in the org.
    hoisted.mockUserFindFirst.mockImplementation(async (...args: unknown[]) => {
      // First call resolves the requesting user; subsequent calls (the
      // "other admin" lookup inside checkOrgMembership) return null.
      if (hoisted.mockUserFindFirst.mock.calls.length === 1) {
        return stubUser({ organizationId: 'org-1', role: 'corporate_admin' });
      }
      return null;
    });

    await expect(
      createDeletionRequest({ userId: 'user-1', forfeitWalletBalance: false })
    ).rejects.toThrow('organisation needs an admin');
  });

  it('rejects a regular org member with the generic leave-org message', async () => {
    hoisted.mockUserFindFirst.mockResolvedValue(stubUser({ organizationId: 'org-1', role: 'user' }));

    await expect(
      createDeletionRequest({ userId: 'user-1', forfeitWalletBalance: false })
    ).rejects.toThrow('Leave your organisation');
  });

  it('rejects when a non-terminal deletion request already exists', async () => {
    hoisted.mockUserFindFirst.mockResolvedValue(stubUser());
    hoisted.mockDeletionRequestFindFirst.mockResolvedValue({ id: 'existing', status: 'pending' });

    await expect(
      createDeletionRequest({ userId: 'user-1', forfeitWalletBalance: false })
    ).rejects.toThrow('already have a pending account deletion request');
  });

  it('creates a request with a 14-day scheduled_for when all checks pass', async () => {
    hoisted.mockUserFindFirst.mockResolvedValue(stubUser());
    hoisted.mockInsertReturning.mockResolvedValue([{ id: 'req-2', status: 'pending' }]);

    await createDeletionRequest({ userId: 'user-1', forfeitWalletBalance: false });

    const insertedRow = hoisted.mockInsertValues.mock.calls[0]?.[0] as {
      requestedAt: Date;
      scheduledFor: Date;
    };
    const deltaMs = insertedRow.scheduledFor.getTime() - insertedRow.requestedAt.getTime();
    expect(deltaMs).toBe(14 * 24 * 60 * 60 * 1000);
  });
});

// ────────────────────────────────────────────────────────────
// cancelDeletionRequest
// ────────────────────────────────────────────────────────────
describe('cancelDeletionRequest', () => {
  it('throws 404 when there is no pending/legal_hold request', async () => {
    hoisted.mockDeletionRequestFindFirst.mockResolvedValue(null);
    await expect(cancelDeletionRequest('user-1')).rejects.toThrow('No pending deletion request found');
  });

  it('cancels a pending request', async () => {
    hoisted.mockDeletionRequestFindFirst.mockResolvedValue({ id: 'req-1', status: 'pending' });
    hoisted.mockUpdateReturning.mockResolvedValue([{ id: 'req-1', status: 'cancelled' }]);

    const result = await cancelDeletionRequest('user-1');

    expect(result.status).toBe('cancelled');
    const setArg = hoisted.mockUpdateSet.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg.status).toBe('cancelled');
  });
});

// ────────────────────────────────────────────────────────────
// checkLegalHold
// ────────────────────────────────────────────────────────────
describe('checkLegalHold', () => {
  it('is not blocked when there are no open safety records', async () => {
    const result = await checkLegalHold('user-1');
    expect(result.blocked).toBe(false);
  });

  it('is blocked by an open incident reported by the user', async () => {
    hoisted.mockIncidentsFindMany.mockResolvedValue([{ id: 'incident-1' }]);

    const result = await checkLegalHold('user-1');

    expect(result.blocked).toBe(true);
    if (result.blocked) {
      expect(result.refs).toContain('incident-1');
    }
  });

  it('is blocked by a non-terminal emergency event on one of the user\'s trips', async () => {
    hoisted.mockTripsFindMany.mockResolvedValue([{ id: 'trip-1' }]);
    hoisted.mockEmergencyEventsFindMany.mockResolvedValue([{ id: 'emergency-1' }]);

    const result = await checkLegalHold('user-1');

    expect(result.blocked).toBe(true);
    if (result.blocked) {
      expect(result.refs).toContain('emergency-1');
    }
  });

  it('is blocked by a non-terminal escalation on one of the user\'s trips', async () => {
    hoisted.mockTripsFindMany.mockResolvedValue([{ id: 'trip-1' }]);
    hoisted.mockEscalationsFindMany.mockResolvedValue([{ id: 'escalation-1' }]);

    const result = await checkLegalHold('user-1');

    expect(result.blocked).toBe(true);
    if (result.blocked) {
      expect(result.refs).toContain('escalation-1');
    }
  });

  it('does not query emergency/escalation tables when the user has no trips', async () => {
    hoisted.mockTripsFindMany.mockResolvedValue([]);

    await checkLegalHold('user-1');

    expect(hoisted.mockEmergencyEventsFindMany).not.toHaveBeenCalled();
    expect(hoisted.mockEscalationsFindMany).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────
// overrideLegalHold / forceDeleteUser
// ────────────────────────────────────────────────────────────
describe('overrideLegalHold', () => {
  it('throws 404 when the request does not exist', async () => {
    hoisted.mockDeletionRequestFindFirst.mockResolvedValue(null);
    await expect(overrideLegalHold('req-1', 'admin-1', 'reason')).rejects.toThrow(
      'Deletion request not found'
    );
  });

  it('throws 400 when the request is not on legal_hold', async () => {
    hoisted.mockDeletionRequestFindFirst.mockResolvedValue({ id: 'req-1', status: 'pending' });
    await expect(overrideLegalHold('req-1', 'admin-1', 'reason')).rejects.toThrow(
      'Request is not on legal hold'
    );
  });

  it('executes the cascade and marks the request completed with override metadata', async () => {
    hoisted.mockDeletionRequestFindFirst.mockResolvedValue({
      id: 'req-1',
      userId: 'user-1',
      status: 'legal_hold',
    });
    hoisted.mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        select: () => ({ from: () => ({ where: async () => [] }) }),
        delete: () => ({ where: async () => undefined }),
        update: () => ({ set: () => ({ where: async () => undefined }) }),
      };
      return fn(tx);
    });
    hoisted.mockUpdateReturning.mockResolvedValue([{ id: 'req-1', status: 'completed' }]);

    const result = await overrideLegalHold('req-1', 'admin-1', 'resolved externally');

    expect(result.status).toBe('completed');
    expect(hoisted.mockTransaction).toHaveBeenCalledTimes(1);
    const setArg = hoisted.mockUpdateSet.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg.holdOverriddenBy).toBe('admin-1');
    expect(setArg.holdOverrideReason).toBe('resolved externally');
  });
});

describe('forceDeleteUser', () => {
  it('throws 404 when the user does not exist', async () => {
    hoisted.mockUserFindFirst.mockResolvedValue(null);
    await expect(forceDeleteUser('user-1', 'admin-1', 'reason', false)).rejects.toThrow(
      'User not found'
    );
  });

  it('throws 400 when the user was already deleted', async () => {
    hoisted.mockUserFindFirst.mockResolvedValue(stubUser({ deletedAt: new Date() }));
    await expect(forceDeleteUser('user-1', 'admin-1', 'reason', false)).rejects.toThrow(
      'already been deleted'
    );
  });

  it('rejects an open legal hold unless overrideHold is passed', async () => {
    hoisted.mockUserFindFirst.mockResolvedValue(stubUser());
    hoisted.mockIncidentsFindMany.mockResolvedValue([{ id: 'incident-1' }]);

    await expect(forceDeleteUser('user-1', 'admin-1', 'reason', false)).rejects.toThrow(
      'Cannot force-delete'
    );
  });

  it('proceeds past an open legal hold when overrideHold is true', async () => {
    hoisted.mockUserFindFirst.mockResolvedValue(stubUser());
    hoisted.mockIncidentsFindMany.mockResolvedValue([{ id: 'incident-1' }]);
    hoisted.mockInsertReturning.mockResolvedValue([
      { id: 'req-3', status: 'pending', userId: 'user-1' },
    ]);
    hoisted.mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        select: () => ({ from: () => ({ where: async () => [] }) }),
        delete: () => ({ where: async () => undefined }),
        update: () => ({ set: () => ({ where: async () => undefined }) }),
      };
      return fn(tx);
    });
    hoisted.mockUpdateReturning.mockResolvedValue([{ id: 'req-3', status: 'force_deleted' }]);

    const result = await forceDeleteUser('user-1', 'admin-1', 'NDPR escalation', true);

    expect(result.status).toBe('force_deleted');
    const setArg = hoisted.mockUpdateSet.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setArg.forceDeletedBy).toBe('admin-1');
    expect(setArg.holdOverriddenBy).toBe('admin-1');
  });
});
