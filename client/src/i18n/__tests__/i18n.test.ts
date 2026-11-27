/// <reference types="jest" />
import { detectLanguage, DICTIONARIES, format, pluralIn, translateIn } from '../core';
import { LANGUAGES, pluralCategory, type PluralForms } from '../languages';

const placeholders = (value: string | PluralForms): string[] => {
  const texts = typeof value === 'string' ? [value] : Object.values(value).filter((text): text is string => Boolean(text));
  const names = texts.flatMap((text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]));
  // {count} e opțional în forma „one” („O activitate…”), deci nu îl comparăm.
  return [...new Set(names)].filter((name) => name !== 'count').sort();
};

describe('dicționare', () => {
  const keys = Object.keys(DICTIONARIES.ro).sort();

  it.each(LANGUAGES)('%s are exact cheile din ro.ts', (language) => {
    expect(Object.keys(DICTIONARIES[language]).sort()).toEqual(keys);
  });

  it.each(LANGUAGES)('%s: niciun text gol, iar parametrii {nume} sunt aceiași ca în română', (language) => {
    for (const key of keys) {
      const value = (DICTIONARIES[language] as Record<string, string | PluralForms>)[key];
      const source = (DICTIONARIES.ro as Record<string, string | PluralForms>)[key];
      const texts = typeof value === 'string' ? [value] : [value.one, value.other];
      texts.forEach((text) => expect(text.trim()).not.toBe(''));
      expect({ key, params: placeholders(value) }).toEqual({ key, params: placeholders(source) });
      expect(typeof value).toBe(typeof source);
    }
  });

  it('pluralele românești au și forma „few”', () => {
    for (const value of Object.values(DICTIONARIES.ro)) {
      if (typeof value !== 'string') expect(value.few).toBeTruthy();
    }
  });
});

describe('plural', () => {
  it('română: 1 zi, 2–19 zile, „de” de la 20 în sus și la sute', () => {
    const days = (count: number) => pluralIn('ro', 'plural.days', count);
    expect(days(1)).toBe('1 zi');
    expect(days(0)).toBe('0 zile');
    expect(days(12)).toBe('12 zile');
    expect(days(20)).toBe('20 de zile');
    expect(days(99)).toBe('99 de zile');
    expect(days(100)).toBe('100 de zile');
    expect(days(101)).toBe('101 zile');
    expect(days(119)).toBe('119 zile');
    expect(days(120)).toBe('120 de zile');
    expect(pluralIn('ro', 'plural.points', 25)).toBe('25 de puncte');
  });

  it('engleză și spaniolă: one/other', () => {
    expect(pluralIn('en', 'plural.days', 1)).toBe('1 day');
    expect(pluralIn('en', 'plural.days', 0)).toBe('0 days');
    expect(pluralIn('en', 'plural.points', 21)).toBe('21 points');
    expect(pluralIn('es', 'plural.activities', 1)).toBe('1 actividad');
    expect(pluralIn('es', 'plural.activities', 3)).toBe('3 actividades');
    expect(pluralCategory('es', 101)).toBe('other');
  });
});

describe('texte', () => {
  it('înlocuiește parametrii și îi lasă vizibili pe cei lipsă', () => {
    expect(format('Salut, {name}!', { name: 'Ana' })).toBe('Salut, Ana!');
    expect(format('{a} și {b}', { a: 1 })).toBe('1 și {b}');
    expect(translateIn('es', 'home.greeting', { name: 'Ana' })).toBe('¡Hola, Ana!');
    expect(translateIn('en', 'card.result', { streak: '1 day', points: '1 point' })).toBe('Streak: 1 day · 1 point');
  });

  it('textul de confirmare pe care îl verifică testul UI rămâne același în română', () => {
    const message = translateIn('ro', 'card.result', {
      streak: pluralIn('ro', 'plural.days', 1), points: pluralIn('ro', 'plural.points', 2),
    });
    expect(message).toBe('Streak: 1 zi · 2 puncte');
  });
});

describe('limba dispozitivului', () => {
  it('prima limbă suportată din listă, altfel engleză', () => {
    expect(detectLanguage(['ro-RO', 'en-US'])).toBe('ro');
    expect(detectLanguage(['de-DE', 'es-MX'])).toBe('es');
    expect(detectLanguage(['pt_BR'])).toBe('en');
    expect(detectLanguage([])).toBe('en');
    expect(detectLanguage([null, undefined, 'EN-gb'])).toBe('en');
  });
});
