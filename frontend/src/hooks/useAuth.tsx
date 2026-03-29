/* eslint-disable react-refresh/only-export-components */
/**
 * AuthContext — provides authentication state and actions to the entire app.
 *
 * Usage:
 *   Wrap your app with <AuthProvider> and consume via useAuth().
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  getMe,
  login as apiLogin,
  logout as apiLogout,
  setToken,
  type UserProfile,
} from '../api/auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthStatus = 'initialising' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: UserProfile | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** True when the logged-in user holds the given role or higher. */
  hasRole: (role: 'viewer' | 'operator' | 'admin') => boolean;
}

const ROLE_ORDER: Record<string, number> = { viewer: 0, operator: 1, admin: 2 };

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('initialising');
  const [user, setUser] = useState<UserProfile | null>(null);

  // On mount, check if there's a stored token from the session.
  // The token is kept in sessionStorage so it survives page refreshes within
  // the same browser tab but is automatically discarded when the tab is closed.
  useEffect(() => {
    // We keep the token in sessionStorage so it survives page refreshes but
    // is discarded when the browser tab is closed.
    const stored = sessionStorage.getItem('sw_token');
    if (stored) {
      setToken(stored);
      getMe()
        .then((profile) => {
          setUser(profile);
          setStatus('authenticated');
        })
        .catch(() => {
          sessionStorage.removeItem('sw_token');
          setToken(null);
          setStatus('unauthenticated');
        });
    } else {
      setStatus('unauthenticated');
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { access_token } = await apiLogin({ username, password });
    setToken(access_token);
    sessionStorage.setItem('sw_token', access_token);
    const profile = await getMe();
    setUser(profile);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    sessionStorage.removeItem('sw_token');
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const hasRole = useCallback(
    (role: 'viewer' | 'operator' | 'admin'): boolean => {
      if (!user) return false;
      return (ROLE_ORDER[user.role] ?? -1) >= (ROLE_ORDER[role] ?? 0);
    },
    [user],
  );

  return (
    <AuthContext.Provider value={{ status, user, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
