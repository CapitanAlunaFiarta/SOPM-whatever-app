import { cancelStreakReminders } from './reminder';

/**
 * Pe telefon nu există Web Push (iar notificările trimise de server ar cere Firebase): aici aplicația are doar
 * amintirea locală pentru streak (reminder.ts). Notificările pentru cereri și mesaje vin prin site (push.web.ts).
 */
export type PushState = 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on';

export function pushSupported(): boolean {
  return false;
}

export async function pushState(): Promise<PushState> {
  return 'unsupported';
}

export async function enablePush(language?: string): Promise<PushState> {
  void language;
  return 'unsupported';
}

export async function disablePush(): Promise<void> {
  // nimic pe telefon
}

export async function refreshPush(language?: string): Promise<void> {
  void language;
}

/** La deconectare: amintirile programate pentru contul ăsta nu mai au rost. */
export async function releaseDevice(): Promise<void> {
  await cancelStreakReminders().catch(() => undefined);
}
