import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { formatTimestamp, friendlyDate, monthLabel } from '@/lib/dates';
import * as storage from '@/lib/storage';

import { currentLanguage, detectLanguage, pluralIn, setCurrentLanguage, translateIn } from './core';
import { isLanguage, LOCALE_TAGS, type Language } from './languages';
import type { Params, PluralKey, TextKey } from './types';

export { LANGUAGE_NAMES, LANGUAGES, type Language } from './languages';
export { currentLanguage, translate } from './core';
export type { PluralKey, TextKey } from './types';

const STORAGE_KEY = 'whatever.language';

/** Pe web citim alegerea salvată sincron, ca prima randare să fie deja în limba bună. */
function savedWebLanguage(): Language | null {
  if (Platform.OS !== 'web') return null;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return isLanguage(saved) ? saved : null;
  } catch {
    return null;
  }
}

function deviceLanguage(): Language {
  try {
    return detectLanguage(getLocales().map((locale) => locale.languageTag));
  } catch {
    return 'en';
  }
}

setCurrentLanguage(savedWebLanguage() ?? deviceLanguage());

type I18nValue = {
  language: Language;
  /** Eticheta BCP 47 (ex. ro-RO), pentru componentele native de dată. */
  locale: string;
  /** Alegerea salvată a fost citită (pe telefon, din SecureStore). */
  ready: boolean;
  setLanguage: (language: Language) => void;
  t: (key: TextKey, params?: Params) => string;
  tp: (key: PluralKey, count: number, params?: Params) => string;
  formatDate: (value: string, options?: { inline?: boolean }) => string;
  formatTime: (value: string) => string;
  formatMonth: (month: string) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(currentLanguage);
  const [ready, setReady] = useState(Platform.OS === 'web');

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    let cancelled = false;
    storage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (!cancelled && isLanguage(saved)) {
          setCurrentLanguage(saved);
          setLanguageState(saved);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setCurrentLanguage(next);
    setLanguageState(next);
    storage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo<I18nValue>(() => ({
    language,
    locale: LOCALE_TAGS[language],
    ready,
    setLanguage,
    t: (key, params) => translateIn(language, key, params),
    tp: (key, count, params) => pluralIn(language, key, count, params),
    formatDate: (date, options) => friendlyDate(date, language, options),
    formatTime: (date) => formatTimestamp(date, language),
    formatMonth: (month) => monthLabel(month, language),
  }), [language, ready, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider.');
  return context;
}
