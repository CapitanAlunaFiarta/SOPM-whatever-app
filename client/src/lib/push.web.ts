import { request } from './api';

/**
 * Notificările pe web (Web Push, fără Firebase): browserul se abonează cu cheia publică VAPID a serverului, iar
 * serverul trimite mesaje criptate pe care le afișează service worker-ul din public/push-sw.js.
 */
export type PushState = 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on';

const WORKER = '/push-sw.js';

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Pe iPhone/iPad, Web Push merge doar din aplicația adăugată pe ecranul principal (Safari 16.4+). */
function iosOutsideHomeScreen(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration('/');
  return (await registration?.pushManager.getSubscription()) ?? null;
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return iosOutsideHomeScreen() ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  return (await currentSubscription()) ? 'on' : 'off';
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function sameKey(buffer: ArrayBuffer | null, key: Uint8Array): boolean {
  if (!buffer) return false;
  const bytes = new Uint8Array(buffer);
  return bytes.length === key.length && bytes.every((value, index) => value === key[index]);
}

async function register(subscription: PushSubscription, language: string) {
  const json = subscription.toJSON();
  await request('user', '/push/subscriptions', { method: 'POST', body: { endpoint: json.endpoint, keys: json.keys, language } });
}

/** Cere voie browserului, abonează acest dispozitiv și îl leagă de cont. */
export async function enablePush(language: string): Promise<PushState> {
  if (!pushSupported()) return iosOutsideHomeScreen() ? 'ios-install' : 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const { publicKey } = await request<{ publicKey: string }>('user', '/push/key');
  const key = fromBase64Url(publicKey);
  await navigator.serviceWorker.register(WORKER, { scope: '/' });
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  // Abonamentul făcut cu o altă cheie a serverului nu mai primește nimic: îl refacem.
  if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await register(subscription, language);
  return 'on';
}

/** Oprește notificările pe acest dispozitiv (și pe server, și în browser). */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const subscription = await currentSubscription();
  if (!subscription) return;
  try {
    await request('user', '/push/unsubscribe', { method: 'POST', body: { endpoint: subscription.endpoint } });
  } finally {
    await subscription.unsubscribe();
  }
}

/** La pornire, cu contul conectat: un browser deja abonat e legat din nou de cont, cu limba de acum. */
export async function refreshPush(language: string): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const subscription = await currentSubscription();
  if (subscription) await register(subscription, language);
}

/**
 * La deconectare: browserul nu mai primește notificările contului (altfel le-ar vedea și cine intră după tine).
 * Nu blochează deconectarea mai mult de câteva secunde.
 */
export async function releaseDevice(): Promise<void> {
  await Promise.race([disablePush().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 3000))]);
}
