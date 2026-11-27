import { CATEGORIES, type Category } from '@/lib/types';

import type { IconName } from './ui';

/** Iconița fiecărei categorii (etichetele vin din i18n: category.* și categoryShort.*). */
export const CATEGORY_ICONS: Record<Category, IconName> = {
  SPORT: 'barbell-outline',
  STUDY: 'school-outline',
  CHORES: 'basket-outline',
  ENTERTAINMENT: 'game-controller-outline',
};

/** Cheie de categorie cunoscută (un server mai vechi poate trimite încă numele vechi, ex. „Personal”). */
export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}
