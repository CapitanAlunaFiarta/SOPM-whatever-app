import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import type { FocusApp, FocusSession, OpenedApp } from './focusRules';
import * as storage from './storage';

/** Modulul nativ din client/modules/focus-guard (doar în aplicația de Android). */
type FocusGuardNative = {
  hasUsageAccess(): boolean;
  openUsageAccessSettings(): void;
  getLaunchableApps(): Promise<FocusApp[]>;
  getOpenedApps(since: number, packages: string[]): Promise<OpenedApp[]>;
};

const native = Platform.OS === 'android' ? requireOptionalNativeModule<FocusGuardNative>('FocusGuard') : null;

/** Sesiunile de focus există doar pe Android (iOS cere un drept special de la Apple, web nu are acces). */
export const focusAvailable = native != null;

const SESSION_KEY = 'whatever.focus.session';
const APPS_KEY = 'whatever.focus.apps';

export function hasUsageAccess(): boolean {
  try {
    return native?.hasUsageAccess() ?? false;
  } catch {
    return false;
  }
}

export function openUsageAccessSettings(): void {
  native?.openUsageAccessSettings();
}

export async function launchableApps(): Promise<FocusApp[]> {
  return native ? native.getLaunchableApps() : [];
}

export async function openedApps(session: FocusSession): Promise<OpenedApp[]> {
  if (!native) return [];
  return native.getOpenedApps(session.startedAt, session.apps.map((app) => app.packageName));
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Aplicațiile alese ultima dată (se propun din nou la următoarea sesiune). */
export async function savedApps(): Promise<string[]> {
  return (await readJson<string[]>(APPS_KEY)) ?? [];
}

export async function saveApps(packages: string[]): Promise<void> {
  await storage.setItem(APPS_KEY, JSON.stringify(packages));
}

/** Sesiunea pornită (rămâne salvată și dacă aplicația e închisă între timp). */
export async function currentSession(): Promise<FocusSession | null> {
  return readJson<FocusSession>(SESSION_KEY);
}

export async function saveSession(session: FocusSession): Promise<void> {
  await storage.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await storage.removeItem(SESSION_KEY);
}
