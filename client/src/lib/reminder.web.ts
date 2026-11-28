/** Pe web nu există amintirea locală de seară (browserul nu poate programa notificări fără server). */
export type ReminderSettings = { enabled: boolean; hour: number };
export { REMINDER_HOURS } from './reminderPlan';
export const DEFAULT_REMINDER: ReminderSettings = { enabled: false, hour: 20 };

export async function cancelStreakReminders(): Promise<void> {
  // nimic pe web
}

export type ReminderTexts = Record<string, unknown>;

export async function rescheduleReminders(): Promise<void> {
  // nimic pe web
}
