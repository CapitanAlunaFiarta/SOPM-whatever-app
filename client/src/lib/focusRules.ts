/** Reguli pure pentru sesiunile de focus (testabile fără telefon). */

export type FocusApp = { packageName: string; label: string };

export type FocusSession = {
  taskId: number;
  taskTitle: string;
  minutes: number;
  /** Momentele de început și de sfârșit, în milisecunde (ceasul telefonului). */
  startedAt: number;
  endsAt: number;
  apps: FocusApp[];
};

export type OpenedApp = { packageName: string; timestamp: number };

export type FocusOutcome =
  | { status: 'running'; remainingMs: number }
  | { status: 'failed'; app: string; afterMinutes: number }
  | { status: 'succeeded' };

export const FOCUS_DURATIONS = [15, 25, 45, 60] as const;

/**
 * Sesiunea pică dacă vreuna dintre aplicațiile urmărite a fost adusă în prim-plan între început și sfârșit;
 * altfel reușește când s-a terminat timpul și rulează până atunci.
 */
export function focusOutcome(session: FocusSession, opened: readonly OpenedApp[], now: number): FocusOutcome {
  const watched = new Map(session.apps.map((app) => [app.packageName, app.label]));
  const first = opened
    .filter((event) => watched.has(event.packageName) && event.timestamp >= session.startedAt && event.timestamp <= session.endsAt)
    .sort((a, b) => a.timestamp - b.timestamp)[0];
  if (first) {
    return {
      status: 'failed',
      app: watched.get(first.packageName) ?? first.packageName,
      afterMinutes: Math.max(0, Math.floor((first.timestamp - session.startedAt) / 60_000)),
    };
  }
  if (now >= session.endsAt) return { status: 'succeeded' };
  return { status: 'running', remainingMs: session.endsAt - now };
}

/** „12:05” pentru timpul rămas. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function newSession(taskId: number, taskTitle: string, minutes: number, apps: FocusApp[], now: number): FocusSession {
  return { taskId, taskTitle, minutes, startedAt: now, endsAt: now + minutes * 60_000, apps };
}
