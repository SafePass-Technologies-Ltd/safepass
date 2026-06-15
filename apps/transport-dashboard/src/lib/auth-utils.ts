/// Auth utilities — JWT decoding and user session management for the transport partner dashboard.
export interface UserSession {
  userId: string;
  email: string;
  role: string;
  orgId?: string;
}

export function getUserSession(): UserSession | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('access_token');
  if (!token) return null;
  try {
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

export function needsOnboarding(): boolean {
  const session = getUserSession();
  if (!session) return false;
  return !session.orgId;
}
