import type { Category } from '@/lib/types';

import type { IconName } from './ui';

/** Iconița fiecărei categorii (etichetele vin din i18n: category.* și categoryShort.*). */
export const CATEGORY_ICONS: Record<Category, IconName> = {
  SPORT: 'barbell-outline',
  STUDY: 'school-outline',
  CHORES: 'basket-outline',
  ENTERTAINMENT: 'game-controller-outline',
};
