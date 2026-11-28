import { type Href, router } from 'expo-router';
import { useEffect } from 'react';

import { useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { refreshPush } from '@/lib/push';

/**
 * Legătura dintre notificări și aplicație, pe web: un browser deja abonat e legat din nou de cont (cu limba de acum),
 * iar apăsarea pe o notificare cu aplicația deschisă navighează fără reîncărcare (mesaj de la push-sw.js).
 */
export function NotificationBridge() {
  const { status } = useAuth();
  const { language } = useI18n();

  useEffect(() => {
    if (status === 'signedIn') void refreshPush(language).catch(() => undefined);
  }, [status, language]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: unknown } | null;
      if (data?.type === 'whatever-open' && typeof data.url === 'string' && data.url.startsWith('/')) router.push(data.url as Href);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  return null;
}
