import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, map } from 'rxjs';
import { API_GATEWAY_URL } from './api.config';
import { ApiSuccess, AuthResult, User } from './models';

interface Session {
  token: string;
  expiresAt: string;
  user: User;
}

const STORAGE_KEY = 'auth';
const EXPIRED_MESSAGE = 'Your session has expired. Please log in again.';

/**
 * Holds the JWT and the current user as signals. Stored in sessionStorage: survives a page
 * reload, cleared when the tab closes. Logs out automatically when the token expires, or when
 * any API answers 401 (see apiInterceptor).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly session = signal<Session | null>(loadSession());
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;

  /** One-off message for the login page, e.g. "Your session has expired". */
  readonly notice = signal<string | null>(null);
  readonly user = computed(() => this.session()?.user ?? null);
  readonly token = computed(() => this.session()?.token ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly isAdmin = computed(() => this.session()?.user.role === 'Admin');

  constructor() {
    this.scheduleExpiry();
  }

  login(username: string, password: string): Observable<User> {
    return this.http
      .post<ApiSuccess<AuthResult>>(`${API_GATEWAY_URL}/api/auth/login`, { username, password })
      .pipe(
        map(({ data }) => {
          this.setSession({ token: data.accessToken, expiresAt: data.expiresAt, user: data.user });
          this.notice.set(null);
          return data.user;
        }),
      );
  }

  register(input: { username: string; email: string; password: string }): Observable<User> {
    return this.http
      .post<ApiSuccess<User>>(`${API_GATEWAY_URL}/api/auth/register`, input)
      .pipe(map(({ data }) => data));
  }

  logout(reason?: string): void {
    this.setSession(null);
    this.notice.set(reason ?? null);
    void this.router.navigateByUrl('/login');
  }

  /** Called by apiInterceptor when an authenticated request is rejected. */
  sessionExpired(): void {
    if (this.isAuthenticated()) this.logout(EXPIRED_MESSAGE);
  }

  private setSession(session: Session | null): void {
    saveSession(session);
    this.session.set(session);
    this.scheduleExpiry();
  }

  /** Logs out exactly when the token expires. */
  private scheduleExpiry(): void {
    clearTimeout(this.expiryTimer);
    const session = this.session();
    if (!session) return;
    const msLeft = new Date(session.expiresAt).getTime() - Date.now();
    this.expiryTimer = setTimeout(() => this.logout(EXPIRED_MESSAGE), Math.max(msLeft, 0));
  }
}

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (!session?.token || new Date(session.expiresAt).getTime() <= Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function saveSession(session: Session | null): void {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode etc.) - the session simply won't survive a reload.
  }
}
