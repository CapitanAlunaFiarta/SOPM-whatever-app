import { useMemo } from 'react';

import { useI18n } from '@/i18n';

import type { ReminderTexts } from './reminder';

/** Textele amintirii de seară în limba aplicației (se programează din nou când se schimbă limba). */
export function useReminderTexts(): ReminderTexts {
  const { t, tp } = useI18n();
  return useMemo(() => ({
    channel: t('reminder.channel'),
    keepTitle: (days: number) => t('reminder.keepTitle', { days: tp('plural.days', days) }),
    keepBody: t('reminder.keepBody'),
    startTitle: t('reminder.startTitle'),
    startBody: t('reminder.startBody'),
  }), [t, tp]);
}
