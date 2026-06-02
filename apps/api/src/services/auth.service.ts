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
import type { AuthProvider, UserCreate } from '@safepass/shared';

export interface TokenExchangeResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    isNew: boolean;
  };
}

/**
 * Exchange a Firebase ID token for SafePass JWT tokens.
 * If the user doesn't exist in PostgreSQL, creates a new user record.
 */
export async function exchangeFirebaseToken(
  firebaseIdToken: string
): Promise<TokenExchangeResult> {
  // 1. Verify Firebase ID token
  const decodedToken = await admin.auth().verifyIdToken(firebaseIdToken);

  const authProviderId = decodedToken.uid;
  const email = decodedToken.email;
  const fullName = decodedToken.name || email?.split('@')[0] || 'Unknown';
  const provider = mapFirebaseProvider(decodedToken.firebase?.sign_in_provider);

  if (!email) {
    throw new Error('Firebase token missing email claim');
  }

  // 2. Find or create user in PostgreSQL
  let existingUser = await db.query.users.findFirst({
    where: and(
      eq(users.authProvider, provider),
      eq(users.authProviderId, authProviderId)
    ),
  });

  let isNew = false;

  if (!existingUser) {
    // Create new user
    const newUser: typeof users.$inferInsert = {
      id: uuidv4(),
      authProvider: provider,
      authProviderId,
      email,
      fullName,
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

  // Fetch user to get current role/orgId
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

function mapFirebaseProvider(signInProvider?: string): AuthProvider {
  switch (signInProvider) {
    case 'google.com':
      return 'google';
    case 'facebook.com':
      return 'facebook';
    case 'apple.com':
      return 'apple';
    default:
      return 'google';
  }
}
