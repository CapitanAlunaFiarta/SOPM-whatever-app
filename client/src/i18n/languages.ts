/** Limbile aplicației. Română e limba de bază: ro.ts definește cheile, en.ts și es.ts le traduc. */
export const LANGUAGES = ['ro', 'en', 'es'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Numele fiecărei limbi în limba ei, ca în orice selector de limbă. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  ro: 'Română',
  en: 'English',
  es: 'Español',
};

/** Eticheta BCP 47 folosită pentru Accept-Language, <html lang> și selectorul de dată. */
export const LOCALE_TAGS: Record<Language, string> = {
  ro: 'ro-RO',
  en: 'en-US',
  es: 'es-ES',
};

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** Formele de plural: „few” există doar în română (2–19, 101–119 …); celelalte limbi folosesc one/other. */
export type PluralForms = { one: string; few?: string; other: string };

/**
 * Regula de plural (CLDR): în română „1 zi”, „5 zile”, „20 de zile”, „101 zile”; „de” apare când
 * ultimele două cifre sunt 00 sau 20–99. În engleză și spaniolă: 1 → one, altfel other.
 */
export function pluralCategory(language: Language, count: number): keyof PluralForms {
  const value = Math.abs(count);
  if (value === 1) return 'one';
  if (language !== 'ro') return 'other';
  const lastTwo = value % 100;
  return value === 0 || (lastTwo >= 1 && lastTwo <= 19) ? 'few' : 'other';
}
