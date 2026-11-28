import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { LanguagePicker } from '@/components/LanguagePicker';
import { AppText, Badge, Banner, Button, Card, Row, Screen, StatTile, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { appBuild, appVersion, isNewerRelease, startUpdate, updateKind } from '@/lib/appVersion';
import { useAuth } from '@/lib/auth';
import { disableBiometrics, enableBiometrics, getBiometricStatus } from '@/lib/biometrics';
import { confirmAction } from '@/lib/dialogs';
import { useChangePassword, useLatestRelease, useMe } from '@/lib/queries';

export default function ProfileScreen() {
  const { t, tp, formatDate } = useI18n();
  const { user, signOut } = useAuth();
  const me = useMe();
  const current = me.data ?? user;
  if (!current) return null;

  return (
    <Screen title={t('tabs.profile')} subtitle={`@${current.username}`} refreshing={me.isRefetching} onRefresh={() => me.refetch()}>
      <Card>
        <AppText variant="heading">{current.fullName}</AppText>
        <AppText variant="muted">{current.email}</AppText>
        <Row style={{ flexWrap: 'wrap' }}>
          <Badge text={current.role === 'ADMIN' ? t('role.admin') : t('role.user')} tone={current.role === 'ADMIN' ? 'accent' : 'neutral'} />
          {current.lastActiveOn ? (
            <Badge text={t('profile.lastActive', { date: formatDate(current.lastActiveOn, { inline: true }) })} />
          ) : null}
        </Row>
      </Card>
      <Row style={{ flexWrap: 'wrap', alignItems: 'stretch' }}>
        <StatTile label={t('stats.streak')} value={`🔥 ${current.streak}`} hint={tp('plural.days', current.streak)} tone="warning" />
        <StatTile label={t('stats.points')} value={current.points} hint={t('stats.pointsHint')} tone="success" />
        <StatTile label={t('stats.freeze')} value={`${current.freezesLeft}/3`} hint={t('stats.freezeHintRefill')} tone="info" />
      </Row>
      <Button variant="secondary" title={t('recap.title')} icon="stats-chart-outline" onPress={() => router.push('/recap')} />
      <Card>
        <AppText variant="heading">{t('language.title')}</AppText>
        <AppText variant="muted">{t('language.hint')}</AppText>
        <LanguagePicker />
      </Card>
      <BiometricsCard userId={current.id} />
      <PasswordCard />
      <UpdateCard />
      <Button variant="secondary" title={t('common.signOut')} icon="log-out-outline" onPress={async () => {
        if (await confirmAction(t('profile.signOutTitle'), t('profile.signOutText'), t('profile.signOutConfirm'))) await signOut();
      }} />
    </Screen>
  );
}

function BiometricsCard({ userId }: { userId: number }) {
  const { t, language } = useI18n();
  const client = useQueryClient();
  // Limba face parte din cheie: eticheta și indiciul vin traduse din biometrics.ts.
  const status = useQuery({ queryKey: ['biometrics', userId, language], queryFn: () => getBiometricStatus(userId) });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const web = Platform.OS === 'web';

  const toggle = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (status.data?.enabled) {
        await disableBiometrics(userId);
        setNotice(web ? t('bio.webDisabled') : t('bio.nativeDisabled'));
      } else {
        await enableBiometrics(userId);
        setNotice(web ? t('bio.webEnabled') : t('bio.nativeEnabled'));
      }
      await client.invalidateQueries({ queryKey: ['biometrics', userId] });
      await client.invalidateQueries({ queryKey: ['me'] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <AppText variant="heading">{web ? t('passkey.label') : t('bio.generic')}</AppText>
      <AppText variant="muted">{web ? t('bio.webDescription') : t('bio.nativeDescription')}</AppText>
      {error ? <Banner text={error} onClose={() => setError(null)} /> : null}
      {notice ? <Banner tone="success" text={notice} onClose={() => setNotice(null)} /> : null}
      {status.data && !status.data.available ? (
        <Banner tone="info" text={status.data.hint ?? t('bio.deviceUnavailable')} />
      ) : (
        <View style={{ gap: 8 }}>
          <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Badge text={status.data?.enabled ? t('bio.activeHere') : t('bio.inactiveHere')}
              tone={status.data?.enabled ? 'success' : 'neutral'} icon="finger-print" />
            <Button compact variant={status.data?.enabled ? 'secondary' : 'primary'} loading={busy}
              title={status.data?.enabled ? t('bio.disable') : t('bio.enable')} icon="finger-print" onPress={toggle} />
          </Row>
          {status.data?.label ? <AppText variant="small">{status.data.label}</AppText> : null}
        </View>
      )}
    </Card>
  );
}

/** Versiunea instalată și, dacă a apărut una nouă, butonul de actualizare (APK pe Android, reîncărcare pe web). */
function UpdateCard() {
  const { t } = useI18n();
  const latest = useLatestRelease();
  const release = latest.data;
  const newer = isNewerRelease(release);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <AppText variant="heading">{t('update.title')}</AppText>
      <AppText variant="muted">
        {appBuild > 0 ? t('update.currentBuild', { version: appVersion, build: appBuild }) : t('update.current', { version: appVersion })}
      </AppText>
      {error ? <Banner text={error} onClose={() => setError(null)} /> : null}
      {latest.error ? <Banner tone="info" text={t('update.unknown')} />
        : newer && release?.version ? (
          <View style={{ gap: 8 }}>
            <Badge text={t('update.available', { version: release.version })} tone="danger" icon="arrow-up-circle" />
            {updateKind === 'download' ? (
              <>
                <Button title={t('update.download')} icon="download-outline" onPress={() => {
                  startUpdate(release.url).catch((e) => setError(errorMessage(e)));
                }} />
                <AppText variant="small">{t('update.downloadHint')}</AppText>
              </>
            ) : updateKind === 'reload' ? (
              <Button title={t('update.reload')} icon="refresh" onPress={() => { void startUpdate(null); }} />
            ) : <AppText variant="small">{t('update.iosHint')}</AppText>}
          </View>
        ) : release?.version ? <Badge text={t('update.latest')} tone="success" icon="checkmark-circle" /> : null}
      <Button compact variant="ghost" title={t('update.check')} icon="refresh" loading={latest.isFetching}
        onPress={() => { void latest.refetch(); }} />
    </Card>
  );
}

function PasswordCard() {
  const { t } = useI18n();
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setNotice(null);
    if (next.length < 12) {
      setError(t('password.tooShortNew'));
      return;
    }
    try {
      await change.mutateAsync({ currentPassword: current, newPassword: next });
      setNotice(t('password.changed'));
      setCurrent('');
      setNext('');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Card>
      <AppText variant="heading">{t('password.title')}</AppText>
      {error ? <Banner text={error} onClose={() => setError(null)} /> : null}
      {notice ? <Banner tone="success" text={notice} onClose={() => setNotice(null)} /> : null}
      <TextField label={t('password.current')} value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
      <TextField label={t('password.newLabel')} value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" />
      <Button variant="secondary" title={t('password.save')} icon="key-outline" loading={change.isPending} onPress={submit} />
    </Card>
  );
}
