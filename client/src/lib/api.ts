import { API_URLS, REQUEST_TIMEOUT_MS, type ApiService } from './config';
import * as storage from './storage';
import type { Session } from './types';

const REFRESH_KEY = 'whatever.refreshToken';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }

  /** Serverul nu a putut fi contactat (rețea sau server care pornește). */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

type RequestOptions = { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown };

let accessToken: string | null = null;
let refreshToken: string | null = null;
let refreshLoaded = false;
let refreshing: Promise<Session | null> | null = null;
let sessionExpiredHandler: (() => void) | null = null;

export function onSessionExpired(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

async function loadRefreshToken(): Promise<string | null> {
  if (!refreshLoaded) {
    refreshToken = await storage.getItem(REFRESH_KEY);
    refreshLoaded = true;
  }
  return refreshToken;
}

export async function hasStoredSession(): Promise<boolean> {
  return Boolean(await loadRefreshToken());
}

export async function saveSession(session: Session): Promise<void> {
  accessToken = session.token;
  refreshToken = session.refreshToken;
  refreshLoaded = true;
  await storage.setItem(REFRESH_KEY, session.refreshToken);
}

async function forgetSession(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  refreshLoaded = true;
  await storage.removeItem(REFRESH_KEY);
}

/** Deconectare: revocă refresh token-ul pe server (fără să aștepte) și șterge sesiunea locală. */
export async function endSession(): Promise<void> {
  const token = refreshToken;
  await forgetSession();
  if (token) {
    send('user', '/users/logout', { method: 'POST', body: { refreshToken: token } }, false).catch(() => undefined);
  }
}

async function send(service: ApiService, path: string, options: RequestOptions, withAuth: boolean): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${API_URLS[service]}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(withAuth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'Serverul nu răspunde. Dacă a stat nefolosit, pornește în aproximativ 30 de secunde — încearcă din nou.');
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Reface token-ul de acces din refresh token. Întoarce null dacă sesiunea nu mai e validă
 * și aruncă ApiError(0) dacă serverul nu răspunde (sesiunea locală se păstrează în acest caz).
 */
export function refreshSession(): Promise<Session | null> {
  if (!refreshing) {
    refreshing = (async () => {
      const token = await loadRefreshToken();
      if (!token) return null;
      const response = await send('user', '/users/refresh', { method: 'POST', body: { refreshToken: token } }, false);
      const data = await readJson(response);
      if (response.status === 401 || response.status === 400) {
        await forgetSession();
        return null;
      }
      if (!response.ok) throw new ApiError(response.status, data?.error ?? 'Serverul nu răspunde momentan.');
      await saveSession(data as Session);
      return data as Session;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

export async function request<T>(service: ApiService, path: string, options: RequestOptions = {},
                                 { auth = true }: { auth?: boolean } = {}): Promise<T> {
  if (auth && !accessToken) await refreshSession();
  let response = await send(service, path, options, auth);
  if (response.status === 401 && auth) {
    const session = await refreshSession();
    if (session) response = await send(service, path, options, auth);
  }
  const data = await readJson(response);
  if (response.status === 401 && auth) {
    await forgetSession();
    sessionExpiredHandler?.();
  }
  if (!response.ok) {
    throw new ApiError(response.status, data?.error ?? `Eroare de server (${response.status}).`);
  }
  return data as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'A apărut o eroare neașteptată.';
}
