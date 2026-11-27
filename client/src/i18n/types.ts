import type { PluralForms } from './languages';
import type { ro } from './ro';

type Source = typeof ro;

/** Cheile cu text simplu. */
export type TextKey = { [K in keyof Source]: Source[K] extends string ? K : never }[keyof Source];
/** Cheile cu forme de plural (folosite cu `tp`). */
export type PluralKey = Exclude<keyof Source, TextKey>;

/** Forma pe care trebuie să o aibă fiecare traducere: aceleași chei ca ro.ts. */
export type Dictionary = { [K in TextKey]: string } & { [K in PluralKey]: PluralForms };

export type Params = Record<string, string | number>;
