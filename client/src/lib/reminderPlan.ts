import { localDate, parseLocalDate } from './dates';

/** Partea pură a amintirii de seară (fără expo-notifications), ca să poată fi testată. */
export const REMINDER_HOURS = [19, 20, 21, 22] as const;
export const REMINDER_PREFIX = 'streak-';
/** Câte seri înainte se programează (dacă nu deschizi aplicația câteva zile, tot primești amintirea). */
const DAYS_AHEAD = 3;

/**
 * Ce amintiri ar trebui să existe acum (pur, pentru teste): o seară e sărită dacă ai confirmat deja ceva în ziua aceea
 * sau dacă ora a trecut. `lastActiveOn` e ziua ultimei confirmări (ora României, ca streak-ul de pe server).
 */
export function plannedReminders({ hour, streak, lastActiveOn, now = new Date() }: {
  hour: number; streak: number; lastActiveOn: string | null; now?: Date;
}): { id: string; date: Date; keepStreak: number }[] {
  const today = localDate(0, now);
  const doneToday = lastActiveOn === today;
  const result: { id: string; date: Date; keepStreak: number }[] = [];
  for (let offset = 0; offset < DAYS_AHEAD; offset += 1) {
    const day = localDate(offset, now);
    if (offset === 0 && doneToday) continue;
    const at = parseLocalDate(day);
    at.setHours(hour, 0, 0, 0);
    if (at.getTime() <= now.getTime()) continue;
    // Streak-ul de păstrat în seara aceea: azi, cel de acum (dacă e încă viu); mâine, doar dacă ai confirmat azi.
    let keepStreak = 0;
    if (offset === 0) keepStreak = streak;
    else if (offset === 1 && doneToday) keepStreak = streak;
    result.push({ id: `${REMINDER_PREFIX}${day}`, date: at, keepStreak });
  }
  return result;
}

