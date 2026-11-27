import { en } from './en';
import { es } from './es';
import { isLanguage, pluralCategory, type Language, type PluralForms } from './languages';
import { ro } from './ro';
import type { Dictionary, Params, PluralKey, TextKey } from './types';

export const DICTIONARIES: Record<Language, Dictionary> = { ro, en, es };

/** Înlocuiește {nume} cu valoarea din params; parametrii lipsă rămân vizibili, ca să se observe. */
export function format(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

export function translateIn(language: Language, key: TextKey, params?: Params): string {
  return format(DICTIONARIES[language][key] ?? DICTIONARIES.ro[key] ?? key, params);
}

export function pluralIn(language: Language, key: PluralKey, count: number, params?: Params): string {
  const forms: PluralForms = DICTIONARIES[language][key] ?? DICTIONARIES.ro[key];
  const form = forms[pluralCategory(language, count)] ?? forms.other;
  return format(form, { count, ...params });
}

/** Prima limbă suportată din lista preferată (ex. „es-MX” → es); altfel engleză. */
export function detectLanguage(tags: readonly (string | null | undefined)[]): Language {
  for (const tag of tags) {
    const code = tag?.trim().toLowerCase().split(/[-_]/)[0];
    if (isLanguage(code)) return code;
  }
  return 'en';
}

// Limba activă, pentru codul din afara componentelor (cereri, erori din biometrie și locație).
// O setează I18nProvider; componentele folosesc useI18n().
let active: Language = 'ro';

export function currentLanguage(): Language {
  return active;
}

export function setCurrentLanguage(language: Language): void {
  active = language;
}

export function translate(key: TextKey, params?: Params): string {
  return translateIn(active, key, params);
}
