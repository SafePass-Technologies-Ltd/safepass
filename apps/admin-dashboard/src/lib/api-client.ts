/// API Client — Utility for authenticated HTTP requests to SafePass API.
///
/// Attaches the JWT access token automatically and handles 401 refresh.

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

interface ApiClientOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

export async function apiClient<T = unknown>(
  endpoint: string,
  options: ApiClientOptions = {}
): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;

  // Guard against SSR: localStorage is only available in the browser.
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

  // Refuse to fire an unauthenticated request — throw immediately so the
  // caller gets a clear 401 rather than the server returning one after
  // receiving a request with no Authorization header.
  if (!token) {
    throw new ApiError(401, 'No access token found — please sign in again');
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  // If 401, attempt token refresh
  if (response.status === 401 && token) {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      try {
        const refreshResponse = await fetch(`${API_BASE_URL}/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (refreshResponse.ok) {
          const data = await refreshResponse.json();
          localStorage.setItem('access_token', data.accessToken);
          localStorage.setItem('refresh_token', data.refreshToken);

          // Retry original request
          const retryResponse = await fetch(`${API_BASE_URL}${endpoint}`, {
            method,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${data.accessToken}`,
              ...headers,
            },
            body: body ? JSON.stringify(body) : undefined,
          });

          if (!retryResponse.ok) {
            throw new ApiError(retryResponse.status, 'Request failed after token refresh');
          }

          return retryResponse.json();
        }
      } catch {
        // Refresh failed — clear tokens
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/';
      }
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      errorData?.error?.message || `HTTP ${response.status}`
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
