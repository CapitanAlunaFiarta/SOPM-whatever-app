import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';

import { plannedReminders, REMINDER_HOURS, REMINDER_PREFIX } from './reminderPlan';
import { getItem, setItem } from './storage';

export { REMINDER_HOURS } from './reminderPlan';

/**
 * Amintirea de seară pentru streak, doar pe telefon și doar locală (fără server, fără Firebase): dacă până la ora
 * aleasă n-ai confirmat nimic azi, telefonul îți amintește. Se programează din nou de fiecare dată când se schimbă
 * streak-ul sau ziua ultimei confirmări, deci după o confirmare amintirea de azi dispare.
 */
export type ReminderSettings = { enabled: boolean; hour: number };

export const DEFAULT_REMINDER: ReminderSettings = { enabled: false, hour: 20 };
const STORAGE_KEY = 'whatever.streakReminder';
const CHANNEL = 'streak';

export type ReminderTexts = {
  channel: string;
  /** Titlul când ai un streak de păstrat (`days` e deja formatat: „5 zile”). */
  keepTitle: (days: number) => string;
  keepBody: string;
  startTitle: string;
  startBody: string;
};

export async function loadReminder(): Promise<ReminderSettings> {
  try {
    const raw = await getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<ReminderSettings> : {};
    const hour = REMINDER_HOURS.includes(parsed.hour as (typeof REMINDER_HOURS)[number]) ? Number(parsed.hour) : DEFAULT_REMINDER.hour;
    return { enabled: parsed.enabled === true, hour };
  } catch {
    return DEFAULT_REMINDER;
  }
}

export async function saveReminder(settings: ReminderSettings): Promise<void> {
  await setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** Canalul de Android (pe Android 13+ cererea de permisiune apare doar după ce există un canal). */
async function ensureChannel(name: string) {
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name,
    importance: AndroidImportance.DEFAULT,
  });
}

/** Cere voie pentru notificări (o dată). Întoarce dacă avem voie. */
export async function requestReminderPermission(channelName: string): Promise<boolean> {
  await ensureChannel(channelName);
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

export async function reminderPermission(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

export async function cancelStreakReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled.filter((item) => item.identifier.startsWith(REMINDER_PREFIX))
    .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));
}

/** Programează din nou amintirile (le șterge pe cele vechi). Fără permisiune sau cu amintirea oprită: niciuna. */
export async function scheduleStreakReminders({ settings, streak, lastActiveOn, texts }: {
  settings: ReminderSettings; streak: number; lastActiveOn: string | null; texts: ReminderTexts;
}): Promise<void> {
  await cancelStreakReminders();
  if (!settings.enabled || !(await reminderPermission())) return;
  await ensureChannel(texts.channel);
  for (const reminder of plannedReminders({ hour: settings.hour, streak, lastActiveOn })) {
    const keep = reminder.keepStreak > 0;
    await Notifications.scheduleNotificationAsync({
      identifier: reminder.id,
      content: {
        title: keep ? texts.keepTitle(reminder.keepStreak) : texts.startTitle,
        body: keep ? texts.keepBody : texts.startBody,
        data: { url: '/tasks' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminder.date, channelId: CHANNEL },
    });
  }
}

/** Programează din nou pentru utilizatorul conectat, cu setările salvate pe telefon. */
export async function rescheduleReminders(streak: number, lastActiveOn: string | null, texts: ReminderTexts): Promise<void> {
  await scheduleStreakReminders({ settings: await loadReminder(), streak, lastActiveOn, texts });
}
