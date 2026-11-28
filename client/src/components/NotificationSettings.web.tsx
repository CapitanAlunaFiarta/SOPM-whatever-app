import { useEffect, useState } from 'react';

import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { disablePush, enablePush, pushState, type PushState } from '@/lib/push';
import { PUSH_KINDS, usePushSettings, useRefreshPushSettings, useTestPush, useUpdatePushSettings } from '@/lib/queries';

import { AppText, Banner, Button, Card, ToggleRow } from './ui';

/**
 * Profil → Notificări (pe web): pornește notificările pe acest browser (Web Push) și alege ce notificări primești.
 * Pe iPhone merg doar din aplicația adăugată pe ecranul principal; un browser fără Web Push primește o explicație.
 */
export function NotificationSettings() {
  const { t, tp, language } = useI18n();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'danger' | 'success' } | null>(null);
  const settings = usePushSettings(state === 'on');
  const update = useUpdatePushSettings();
  const test = useTestPush();
  const refreshSettings = useRefreshPushSettings();

  useEffect(() => {
    pushState().then(setState).catch(() => setState('unsupported'));
  }, []);

  const toggle = async (on: boolean) => {
    if (busy || state === 'denied') return;
    setBusy(true);
    setMessage(null);
    try {
      setState(on ? await enablePush(language) : (await disablePush(), await pushState()));
      await refreshSettings();
    } catch (error) {
      setMessage({ text: `${t('push.failed')}: ${errorMessage(error)}`, tone: 'danger' });
      setState(await pushState().catch(() => 'off' as const));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <AppText variant="heading">{t('notifications.title')}</AppText>
      {state === null ? <AppText variant="muted">{t('common.loading')}</AppText>
        : state === 'unsupported' ? <AppText variant="muted">{t('push.unsupported')}</AppText>
        : state === 'ios-install' ? <AppText variant="muted">{t('push.iosInstall')}</AppText>
        : (
          <>
            <ToggleRow icon="notifications-outline" label={t('push.toggle')} value={state === 'on'} onChange={toggle}
              description={state === 'denied' ? t('push.denied') : t('push.hint')} />
            {state === 'on' && settings.data ? (
              <>
                <AppText variant="small">{`${t('push.kinds')} · ${tp('plural.pushDevices', settings.data.devices)}`}</AppText>
                {PUSH_KINDS.map((kind) => (
                  <ToggleRow key={kind} label={t(`push.kind.${kind}`)} value={settings.data[kind]}
                    onChange={(value) => update.mutate({ [kind]: value })} />
                ))}
                <Button variant="secondary" icon="paper-plane-outline" title={t('push.test')} loading={test.isPending}
                  onPress={() => test.mutate(undefined, {
                    onSuccess: () => setMessage({ text: t('push.testSent'), tone: 'success' }),
                    onError: (error) => setMessage({ text: errorMessage(error), tone: 'danger' }),
                  })} />
              </>
            ) : null}
          </>
        )}
      {message ? <Banner tone={message.tone} text={message.text} onClose={() => setMessage(null)} /> : null}
    </Card>
  );
}
