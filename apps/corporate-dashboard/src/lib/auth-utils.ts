/// Auth utilities — JWT decoding and user session management.
///
/// The JWT access token is stored in localStorage after token-exchange.
/// We decode it client-side (no crypto verification — the backend already
/// validated it) to extract user metadata like role and orgId.

export interface UserSession {
  userId: string;
  email: string;
  role: string;
  orgId?: string;
}

/**
 * Decode the JWT access token from localStorage.
 * Returns null if no token is found or the token is malformed.
 */
export function getUserSession(): UserSession | null {
  if (typeof window === 'undefined') return null;

  const token = localStorage.getItem('access_token');
  if (!token) return null;

  try {
    // JWT payload is the second segment (base64-encoded JSON).
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload));
    return {
      userId: decoded.sub ?? '',
      email: decoded.email ?? '',
      role: decoded.role ?? '',
      orgId: decoded.orgId ?? undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Check if the user needs to complete company profile onboarding.
 * Returns true if the user's role is corporate_admin or transport_partner
 * and they don't have an organization yet.
 */
export function needsOnboarding(): boolean {
  const session = getUserSession();
  if (!session) return false;
  const orgRoles = ['corporate_admin', 'transport_partner'];
  return orgRoles.includes(session.role) && !session.orgId;
}
