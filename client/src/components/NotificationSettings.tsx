import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { PUSH_KINDS, usePushSettings, useUpdatePushSettings } from '@/lib/queries';
import {
  loadReminder, REMINDER_HOURS, reminderPermission, requestReminderPermission, rescheduleReminders, type ReminderSettings,
  saveReminder,
} from '@/lib/reminder';
import { useReminderTexts } from '@/lib/useReminderTexts';

import { AppText, Banner, Button, Card, Segmented, ToggleRow } from './ui';

/**
 * Profil → Notificări (pe telefon): amintirea de seară pentru streak, locală (fără server). Notificările pentru
 * cereri și mesaje vin prin site (Web Push); dacă ai browsere abonate, aici alegi și ce primesc ele.
 */
export function NotificationSettings() {
  const { t, tp } = useI18n();
  const { user } = useAuth();
  const texts = useReminderTexts();
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [denied, setDenied] = useState(false);
  const site = usePushSettings();
  const update = useUpdatePushSettings();

  useEffect(() => {
    loadReminder().then(async (saved) => {
      setSettings(saved);
      if (saved.enabled) setDenied(!(await reminderPermission()));
    }).catch(() => undefined);
  }, []);

  const change = async (next: ReminderSettings) => {
    let value = next;
    if (next.enabled) {
      const granted = await requestReminderPermission(texts.channel).catch(() => false);
      setDenied(!granted);
      if (!granted) value = { ...next, enabled: false };
    }
    setSettings(value);
    await saveReminder(value);
    await rescheduleReminders(user?.streak ?? 0, user?.lastActiveOn ?? null, texts).catch(() => undefined);
  };

  return (
    <Card>
      <AppText variant="heading">{t('notifications.title')}</AppText>
      {settings ? (
        <>
          <ToggleRow icon="flame-outline" label={t('reminder.toggle')} description={t('reminder.hint')} value={settings.enabled}
            onChange={(enabled) => void change({ ...settings, enabled })} />
          {settings.enabled ? (
            <>
              <AppText variant="small">{t('reminder.hour')}</AppText>
              <Segmented value={String(settings.hour)} onChange={(hour) => void change({ ...settings, hour: Number(hour) })}
                options={REMINDER_HOURS.map((hour) => ({ value: String(hour), label: `${hour}:00` }))} />
            </>
          ) : null}
          {denied ? (
            <>
              <Banner tone="info" text={t('reminder.denied')} />
              <Button compact variant="secondary" icon="settings-outline" title={t('common.openSettings')}
                onPress={() => void Linking.openSettings()} />
            </>
          ) : null}
        </>
      ) : <AppText variant="muted">{t('common.loading')}</AppText>}

      <AppText variant="heading" style={{ marginTop: 6 }}>{t('push.siteTitle')}</AppText>
      <AppText variant="small">{t('push.siteHint')}</AppText>
      {site.data && site.data.devices > 0 ? (
        <>
          <AppText variant="small">{`${t('push.kinds')} · ${tp('plural.pushDevices', site.data.devices)}`}</AppText>
          {PUSH_KINDS.map((kind) => (
            <ToggleRow key={kind} label={t(`push.kind.${kind}`)} value={site.data[kind]}
              onChange={(value) => update.mutate({ [kind]: value })} />
          ))}
        </>
      ) : null}
    </Card>
  );
}
