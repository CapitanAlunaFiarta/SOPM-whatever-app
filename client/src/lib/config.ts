/**
 * Adresele API-urilor. Se pot schimba prin variabile EXPO_PUBLIC_* (în .env sau în eas.json);
 * implicit aplicația folosește serverele de producție de pe Render.
 */
export const API_URLS = {
  user: process.env.EXPO_PUBLIC_USER_API ?? 'https://whatever-user-service.onrender.com/api',
  task: process.env.EXPO_PUBLIC_TASK_API ?? 'https://whatever-task-service.onrender.com/api',
} as const;

export type ApiService = keyof typeof API_URLS;

/** Domeniul pe care sunt înregistrate passkey-urile (WebAuthn RP ID). */
export const PASSKEY_DOMAIN = 'whatever-app-unitbv.me';

/** Cât așteptăm un răspuns: serviciile gratuite Render pot porni în ~20-30 s după o pauză. */
export const REQUEST_TIMEOUT_MS = 75_000;
