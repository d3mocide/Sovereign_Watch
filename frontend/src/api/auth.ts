/**
 * Authentication API client.
 *
 * Stores the JWT access token in memory (module-level variable) as the
 * authoritative runtime store.  A copy is also persisted in sessionStorage
 * (via the AuthProvider in useAuth.tsx) so that the token survives page
 * refreshes within the same browser tab.  sessionStorage is cleared on
 * browser tab close and on explicit logout.
 */

export interface LoginRequest {
  username: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface UserProfile {
  id: number;
  username: string;
  role: 'viewer' | 'operator' | 'admin';
  is_active: boolean;
}

export interface UserCreate {
  username: string;
  password: string;
  role: 'viewer' | 'operator' | 'admin';
}

export interface UserUpdate {
  role?: 'viewer' | 'operator' | 'admin';
  is_active?: boolean;
  password?: string;
}

// ---------------------------------------------------------------------------
// Token storage (in-memory only)
// ---------------------------------------------------------------------------

let _token: string | null = null;

export function getToken(): string | null {
  return _token;
}

export function setToken(token: string | null): void {
  _token = token;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;
  return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // ignore
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------

export async function login(credentials: LoginRequest): Promise<TokenResponse> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  return handleResponse<TokenResponse>(res);
}

export async function logout(): Promise<void> {
  if (_token) {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: authHeaders(),
    }).catch(() => {/* best-effort */});
  }
  setToken(null);
  // Clear sessionStorage defensively; the AuthProvider also does this, but
  // calling it here ensures cleanup even if logout() is used standalone.
  try {
    sessionStorage.removeItem('sw_token');
  } catch {
    // ignore (e.g. in environments where sessionStorage is unavailable)
  }
}

export async function getMe(): Promise<UserProfile> {
  const res = await fetch('/api/auth/me', { headers: authHeaders() });
  return handleResponse<UserProfile>(res);
}

export async function getSetupStatus(): Promise<{ setup_required: boolean }> {
  const res = await fetch('/api/auth/setup-status');
  return handleResponse<{ setup_required: boolean }>(res);
}

export async function firstSetup(username: string, password: string): Promise<UserProfile> {
  const res = await fetch('/api/auth/first-setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return handleResponse<UserProfile>(res);
}

// ---------------------------------------------------------------------------
// User management (admin only)
// ---------------------------------------------------------------------------

export async function listUsers(): Promise<UserProfile[]> {
  const res = await fetch('/api/auth/users', { headers: authHeaders() });
  return handleResponse<UserProfile[]>(res);
}

export async function createUser(data: UserCreate): Promise<UserProfile> {
  const res = await fetch('/api/auth/users', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse<UserProfile>(res);
}

export async function updateUser(userId: number, data: UserUpdate): Promise<UserProfile> {
  const res = await fetch(`/api/auth/users/${userId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  return handleResponse<UserProfile>(res);
}

export async function deactivateUser(userId: number): Promise<void> {
  const res = await fetch(`/api/auth/users/${userId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok && res.status !== 204) {
    await handleResponse<void>(res);
  }
}
