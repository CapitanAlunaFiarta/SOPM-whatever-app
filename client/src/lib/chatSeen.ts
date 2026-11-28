import { useEffect, useSyncExternalStore } from 'react';

import * as storage from './storage';

/**
 * Ultimul mesaj văzut în fiecare chat („community” sau „task-12”), ca lista de chaturi să arate ce e nou.
 * Se ține doar pe dispozitiv: pe un telefon nou, chaturile cu mesaje apar necitite până le deschizi.
 */
const KEY = 'whatever.chat.seen';
const EMPTY: Record<string, number> = {};
let seen: Record<string, number> | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

function load(): Promise<void> {
  loading ??= storage.getItem(KEY)
    .then((raw) => {
      const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
      // Ce s-a marcat cât timp se citea rămâne (valoarea mai mare câștigă).
      seen = { ...parsed, ...Object.fromEntries(Object.entries(seen ?? {}).filter(([key, id]) => id > (parsed[key] ?? 0))) };
    })
    .catch(() => {
      seen ??= {};
    })
    .finally(emit);
  return loading;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Marchează chatul ca citit până la mesajul `id` (inclusiv). */
export function markSeen(chat: string, id: number | undefined) {
  if (!id || (seen?.[chat] ?? 0) >= id) return;
  seen = { ...(seen ?? {}), [chat]: id };
  emit();
  storage.setItem(KEY, JSON.stringify(seen)).catch(() => undefined);
}

/** Id-ul ultimului mesaj văzut pentru fiecare chat; `ready` = s-a citit de pe dispozitiv. */
export function useSeenChats(): { seen: Record<string, number>; ready: boolean } {
  const value = useSyncExternalStore(subscribe, () => seen ?? EMPTY, () => EMPTY);
  useEffect(() => {
    load().catch(() => undefined);
  }, []);
  return { seen: value, ready: seen !== null };
}

export const communityChatKey = 'community';
export const taskChatKey = (id: number) => `task-${id}`;
