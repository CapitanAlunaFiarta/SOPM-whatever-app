import type { Language } from '../i18n/languages';

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

// Tabele proprii în loc de Intl: motorul Hermes de pe telefon nu formatează la fel ca browserul,
// iar textele trebuie să arate identic pe Android, iOS și web.
const RELATIVE: Record<Language, { today: string; tomorrow: string; yesterday: string }> = {
  ro: { today: 'Azi', tomorrow: 'Mâine', yesterday: 'Ieri' },
  en: { today: 'Today', tomorrow: 'Tomorrow', yesterday: 'Yesterday' },
  es: { today: 'Hoy', tomorrow: 'Mañana', yesterday: 'Ayer' },
};

const SHORT_MONTHS: Record<Language, readonly string[]> = {
  ro: ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
};

const MONTHS: Record<Language, readonly string[]> = {
  ro: ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie',
    'noiembrie', 'decembrie'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November',
    'December'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre',
    'diciembre'],
};

type DateOptions = {
  /** Data de referință (implicit azi). */
  today?: string;
  /** În mijlocul unei propoziții: „azi” în loc de „Azi”. */
  inline?: boolean;
};

/** „Azi”, „Mâine”, „Ieri” sau „12 dec.” (en: „Dec 12”), cu anul doar dacă diferă de cel curent. */
export function friendlyDate(value: string, language: Language = 'ro', { today = localDate(), inline = false }: DateOptions = {}): string {
  const reference = parseLocalDate(today);
  const words = RELATIVE[language];
  const relative = value === today ? words.today
    : value === localDate(1, reference) ? words.tomorrow
      : value === localDate(-1, reference) ? words.yesterday : null;
  if (relative) return inline ? relative.toLowerCase() : relative;

  const date = parseLocalDate(value);
  const month = SHORT_MONTHS[language][date.getMonth()];
  const sameYear = date.getFullYear() === reference.getFullYear();
  if (language === 'en') return `${month} ${date.getDate()}${sameYear ? '' : `, ${date.getFullYear()}`}`;
  return `${date.getDate()} ${month}${sameYear ? '' : ` ${date.getFullYear()}`}`;
}

/** Ora unui mesaj: doar ora pentru azi, altfel și ziua. Engleza folosește formatul cu AM/PM. */
export function formatTimestamp(value: string, language: Language = 'ro', now: Date = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const time = language === 'en'
    ? `${date.getHours() % 12 || 12}:${minutes} ${date.getHours() < 12 ? 'AM' : 'PM'}`
    : `${String(date.getHours()).padStart(2, '0')}:${minutes}`;
  const today = localDate(0, now);
  const day = localDate(0, date);
  return day === today ? time : `${friendlyDate(day, language, { today })} · ${time}`;
}

/** Luna în format YYYY-MM. */
export function monthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Luna YYYY-MM mutată cu `delta` luni (ex. -1 = luna anterioară). */
export function shiftMonth(month: string, delta: number): string {
  const [year, value] = month.split('-').map(Number);
  return monthKey(new Date(year, value - 1 + delta, 1));
}

/** „Noiembrie 2026”, „November 2026”, „Noviembre de 2026”. */
export function monthLabel(month: string, language: Language = 'ro'): string {
  const [year, value] = month.split('-').map(Number);
  const name = MONTHS[language][(value || 1) - 1] ?? month;
  const label = language === 'es' ? `${name} de ${year}` : `${name} ${year}`;
  return label.charAt(0).toUpperCase() + label.slice(1);
}
