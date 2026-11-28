import type { RepeatUnit, Task, TaskStatus } from './types';

/** Cel mai mare interval permis (același ca pe server). */
export const MAX_REPEAT: Record<RepeatUnit, number> = { DAY: 365, WEEK: 52 };

export function isValidRepeat(every: number, unit: RepeatUnit): boolean {
  return Number.isInteger(every) && every >= 1 && every <= MAX_REPEAT[unit];
}

type Schedule = Pick<Task, 'dueDate' | 'isRecurring' | 'repeatEvery' | 'repeatUnit'> & { status: TaskStatus };

/** Ziua ca număr (zile de la 1970, în UTC), ca adunările să nu depindă de ora de vară. */
function dayNumber(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Math.round(Date.UTC(year, (month || 1) - 1, day || 1) / 86_400_000);
}

function fromDayNumber(value: number): string {
  const date = new Date(value * 86_400_000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** Câte zile are pasul de repetare (o săptămână = 7 zile). */
export function repeatStepDays(every: number | undefined, unit: RepeatUnit | undefined): number {
  return Math.max(1, every ?? 1) * (unit === 'WEEK' ? 7 : 1);
}

/**
 * Zilele (YYYY-MM-DD) dintre from și to (inclusiv) în care activitatea e programată. Scadența unei activități
 * recurente e următoarea apariție neconfirmată (poate fi în trecut, dacă e restantă); de acolo revine din N în N zile.
 * Activitățile încheiate apar doar în ziua lor, cele anulate deloc.
 */
export function occurrences(task: Schedule, from: string, to: string): string[] {
  if (task.status === 'Canceled' || !task.dueDate) return [];
  if (!task.isRecurring || task.status === 'Completed') {
    return task.dueDate >= from && task.dueDate <= to ? [task.dueDate] : [];
  }
  const step = repeatStepDays(task.repeatEvery, task.repeatUnit);
  const first = dayNumber(task.dueDate);
  const start = dayNumber(from);
  const end = dayNumber(to);
  let day = first >= start ? first : first + Math.ceil((start - first) / step) * step;
  const days: string[] = [];
  for (; day <= end && days.length < 400; day += step) days.push(fromDayNumber(day));
  return days;
}

/** Ziua de după (pentru sfârșitul exclusiv al unui eveniment de o zi). */
export function nextDay(value: string): string {
  return fromDayNumber(dayNumber(value) + 1);
}

/**
 * Săptămânile unei luni (YYYY-MM), de luni până duminică; zilele din lunile vecine sunt null.
 * Ex. decembrie 2026 începe marți: prima săptămână e [null, '2026-12-01', …].
 */
export function monthWeeks(month: string): (string | null)[][] {
  const [year, value] = month.split('-').map(Number);
  const first = dayNumber(`${month}-01`);
  const days = new Date(Date.UTC(year, value, 0)).getUTCDate();
  // getUTCDay: 0 = duminică; vrem 0 = luni.
  const offset = (new Date(first * 86_400_000).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array<null>(offset).fill(null)];
  for (let day = 0; day < days; day++) cells.push(fromDayNumber(first + day));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}
