/** Data locală în format YYYY-MM-DD (nu UTC), cu un decalaj opțional în zile. */
export function localDate(offsetDays = 0, from: Date = new Date()): string {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

const MONTHS = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];

/** „Azi”, „Mâine”, „Ieri” sau „12 dec.” */
export function friendlyDate(value: string, today: string = localDate()): string {
  if (value === today) return 'Azi';
  if (value === localDate(1, parseLocalDate(today))) return 'Mâine';
  if (value === localDate(-1, parseLocalDate(today))) return 'Ieri';
  const date = parseLocalDate(value);
  const sameYear = date.getFullYear() === parseLocalDate(today).getFullYear();
  return `${date.getDate()} ${MONTHS[date.getMonth()]}${sameYear ? '' : ` ${date.getFullYear()}`}`;
}

export function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const day = localDate(0, date);
  return day === localDate() ? time : `${friendlyDate(day)} · ${time}`;
}

export function pluralDays(count: number): string {
  return count === 1 ? '1 zi' : `${count} zile`;
}
