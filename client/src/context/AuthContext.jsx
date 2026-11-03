import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { authApi } from '../api/authApi.js';
import { configureHttp } from '../api/http.js';

/*
 * Holds the JWT and current user. Stored in sessionStorage, so it survives a page reload
 * but is cleared when the tab is closed. Logs out automatically when the token expires
 * or when any API answers 401.
 */

const STORAGE_KEY = 'auth';
const AuthContext = createContext(null);

function loadSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session?.token || new Date(session.expiresAt).getTime() <= Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function saveSession(session) {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode etc.) - the session simply won't survive a reload.
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(loadSession);
  const [notice, setNotice] = useState(null); // e.g. "Your session has expired."
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const logout = useCallback((reason) => {
    saveSession(null);
    setSession(null);
    setNotice(reason ?? null);
  }, []);

  // Let the http module read the token and report 401s. Done during render (not in an
  // effect) because child effects - the pages' first data fetches - run before ours.
  // It only stores two callbacks, so repeating it on every render is harmless.
  configureHttp({
    tokenProvider: () => sessionRef.current?.token ?? null,
    unauthorizedHandler: () => logout('Your session has expired. Please log in again.'),
  });

  // Auto-logout exactly when the token expires.
  useEffect(() => {
    if (!session) return undefined;
    const msLeft = new Date(session.expiresAt).getTime() - Date.now();
    const timer = setTimeout(() => logout('Your session has expired. Please log in again.'), Math.max(msLeft, 0));
    return () => clearTimeout(timer);
  }, [session, logout]);

  const login = useCallback(async (username, password) => {
    const { data } = await authApi.login(username, password);
    const next = { token: data.accessToken, expiresAt: data.expiresAt, user: data.user };
    saveSession(next);
    setSession(next);
    setNotice(null);
    return next.user;
  }, []);

  const value = useMemo(
    () => ({
      token: session?.token ?? null,
      user: session?.user ?? null,
      isAuthenticated: Boolean(session),
      isAdmin: session?.user?.role === 'Admin',
      notice,
      clearNotice: () => setNotice(null),
      login,
      logout,
    }),
    [session, notice, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
