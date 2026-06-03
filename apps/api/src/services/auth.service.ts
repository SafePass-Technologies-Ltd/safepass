import { admin } from './firebase';
import { db } from '../db';
import { users } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import {
  issueAccessToken,
  issueRefreshToken,
  verifyRefreshToken,
  type JwtPayload,
} from '../middleware/auth';
import type { AuthProvider } from '@safepass/shared';

export interface TokenExchangeResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    phone: string | null;
    role: string;
    isNew: boolean;
  };
}

/**
 * Exchange a Firebase ID token for SafePass JWT tokens.
 *
 * Handles both social auth (Google, Facebook, Apple) and phone auth (SMS OTP).
 * - Social auth: email + name come from the provider; phone is null until onboarding.
 * - Phone auth: phone is extracted from the `phone_number` claim;
 *   email is a generated placeholder (phone auth provides no email).
 *
 * If the user doesn't exist in PostgreSQL, creates a new user record.
 */
export async function exchangeFirebaseToken(
  firebaseIdToken: string
): Promise<TokenExchangeResult> {
  // 1. Verify Firebase ID token (single path for all providers)
  const decodedToken = await admin.auth().verifyIdToken(firebaseIdToken);

  const authProviderId = decodedToken.uid;
  const provider = mapFirebaseProvider(decodedToken.firebase?.sign_in_provider);

  // Phone auth users have no email — use a secure placeholder.
  // Social auth users get their email from the provider.
  const isPhoneAuth = provider === 'phone';
  const email =
    decodedToken.email ?? (isPhoneAuth ? `phone_${authProviderId}@user.safepass` : null);

  if (!email) {
    throw new Error('Firebase token missing email claim and is not a phone auth token');
  }

  // Extract phone from phone auth token (Firebase ID token includes `phone_number` claim)
  const phone = decodedToken.phone_number ?? null;

  const fullName = decodedToken.name ?? (isPhoneAuth ? 'User' : email.split('@')[0]);

  // 2. Find or create user in PostgreSQL
  let existingUser = await db.query.users.findFirst({
    where: and(
      eq(users.authProvider, provider),
      eq(users.authProviderId, authProviderId)
    ),
  });

  let isNew = false;

  if (!existingUser) {
    const newUser: typeof users.$inferInsert = {
      id: uuidv4(),
      authProvider: provider,
      authProviderId,
      email,
      fullName,
      phone, // pre-populated for phone auth; null for social auth
      role: 'user',
      emergencyContacts: [],
      isVerified: true,
    };

    const [created] = await db.insert(users).values(newUser).returning();
    existingUser = created;
    isNew = true;
  }

  // 3. Issue JWT tokens
  const jwtPayload: JwtPayload = {
    sub: existingUser.id,
    email: existingUser.email,
    role: existingUser.role,
    orgId: existingUser.organizationId ?? undefined,
  };

  const [accessToken, refreshToken] = await Promise.all([
    issueAccessToken(jwtPayload),
    issueRefreshToken({ sub: existingUser.id }),
  ]);

  return {
    accessToken,
    refreshToken,
    user: {
      id: existingUser.id,
      email: existingUser.email,
      fullName: existingUser.fullName,
      phone: existingUser.phone,
      role: existingUser.role,
      isNew,
    },
  };
}

/**
 * Refresh an access token using a valid refresh token.
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const sub = await verifyRefreshToken(refreshToken);

  const user = await db.query.users.findFirst({
    where: eq(users.id, sub),
  });

  if (!user || !user.isActive) {
    throw new Error('User not found or inactive');
  }

  const jwtPayload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    orgId: user.organizationId ?? undefined,
  };

  const [newAccessToken, newRefreshToken] = await Promise.all([
    issueAccessToken(jwtPayload),
    issueRefreshToken({ sub: user.id }),
  ]);

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

/**
 * Map Firebase sign-in provider string to SafePass AuthProvider enum.
 *
 * Firebase `sign_in_provider` values:
 *   google.com   → google
 *   facebook.com → facebook
 *   apple.com    → apple
 *   phone        → phone
 */
function mapFirebaseProvider(signInProvider?: string): AuthProvider {
  switch (signInProvider) {
    case 'google.com':
      return 'google';
    case 'facebook.com':
      return 'facebook';
    case 'apple.com':
      return 'apple';
    case 'phone':
      return 'phone';
    default:
      return 'google';
  }
}
