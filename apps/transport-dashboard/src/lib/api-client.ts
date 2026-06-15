/// Transport Dashboard — API Client
const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export async function apiClient<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const accessToken = localStorage.getItem('access_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as Record<string, string>) };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  let res = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });

  if (res.status === 401) {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      const r = await fetch(`${BASE_URL}/v1/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }) });
      if (r.ok) {
        const d = await r.json();
        localStorage.setItem('access_token', d.accessToken);
        localStorage.setItem('refresh_token', d.refreshToken);
        headers['Authorization'] = `Bearer ${d.accessToken}`;
        res = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
      } else {
        localStorage.removeItem('access_token'); localStorage.removeItem('refresh_token');
        window.location.href = '/'; throw new ApiError(401, 'Session expired');
      }
    }
  }
  if (res.status === 204) return undefined as T;
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new ApiError(res.status, b?.error?.message ?? res.statusText); }
  return res.json();
}
