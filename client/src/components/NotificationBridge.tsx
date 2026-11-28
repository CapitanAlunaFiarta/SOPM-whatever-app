import * as Notifications from 'expo-notifications';
import { type Href, router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/lib/auth';
import { rescheduleReminders } from '@/lib/reminder';
import { useReminderTexts } from '@/lib/useReminderTexts';

// O amintire care sosește cu aplicația deschisă apare tot ca notificare.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Legătura dintre notificări și aplicație, pe telefon: programează amintirea de seară pentru streak de fiecare dată
 * când se schimbă streak-ul, ziua ultimei confirmări sau limba (și când aplicația revine în față, poate a trecut o zi),
 * iar apăsarea pe o notificare deschide ruta ei.
 */
export function NotificationBridge() {
  const { status, user } = useAuth();
  const texts = useReminderTexts();
  const streak = user?.streak ?? 0;
  const lastActiveOn = user?.lastActiveOn ?? null;
  const latest = useRef({ streak, lastActiveOn, texts, signedIn: status === 'signedIn' });

  useEffect(() => {
    latest.current = { streak, lastActiveOn, texts, signedIn: status === 'signedIn' };
    if (status === 'signedIn') void rescheduleReminders(streak, lastActiveOn, texts).catch(() => undefined);
  }, [status, streak, lastActiveOn, texts]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const current = latest.current;
      if (state === 'active' && current.signedIn) {
        void rescheduleReminders(current.streak, current.lastActiveOn, current.texts).catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, []);

  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!response || status !== 'signedIn') return;
    const url = response.notification.request.content.data?.url;
    if (typeof url === 'string' && url.startsWith('/')) router.push(url as Href);
    void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  }, [response, status]);

  return null;
}
