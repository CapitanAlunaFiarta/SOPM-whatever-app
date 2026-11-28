import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { BadgeGrid } from '@/components/BadgeGrid';
import { LanguagePicker } from '@/components/LanguagePicker';
import { AppText, Badge, Banner, Button, Card, Row, Screen, StatTile, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { appBuild, appVersion, isNewerRelease, startUpdate, updateKind } from '@/lib/appVersion';
import { useAuth } from '@/lib/auth';
import { disableBiometrics, enableBiometrics, getBiometricStatus } from '@/lib/biometrics';
import { confirmAction } from '@/lib/dialogs';
import { useAvatar, useChangePassword, useLatestRelease, useMe, useProfile, useUpdateBio } from '@/lib/queries';
import type { User } from '@/lib/types';

export default function ProfileScreen() {
  const { t, tp } = useI18n();
  const { user, signOut } = useAuth();
  const me = useMe();
  const current = me.data ?? user;
  if (!current) return null;

  return (
    <Screen title={t('tabs.profile')} subtitle={`@${current.username}`} refreshing={me.isRefetching} onRefresh={() => me.refetch()}>
      <ProfileHeader user={current} />
      <Row style={{ flexWrap: 'wrap', alignItems: 'stretch' }}>
        <StatTile label={t('stats.streak')} value={`🔥 ${current.streak}`} tone="warning"
          hint={current.bestStreak && current.bestStreak > current.streak
            ? t('profile.bestStreak', { days: tp('plural.days', current.bestStreak) }) : tp('plural.days', current.streak)} />
        <StatTile label={t('stats.points')} value={current.points} hint={t('stats.pointsHint')} tone="success" />
        <StatTile label={t('stats.freeze')} value={`${current.freezesLeft}/3`} hint={t('stats.freezeHintRefill')} tone="info" />
      </Row>
      <MyBadges username={current.username} />
      <Row style={{ flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 160 }}>
          <Button variant="secondary" title={t('recap.title')} icon="stats-chart-outline" onPress={() => router.push('/recap')} />
        </View>
        <View style={{ flex: 1, minWidth: 160 }}>
          <Button variant="secondary" title={t('profile.publicView')} icon="eye-outline"
            onPress={() => router.push({ pathname: '/user/[username]', params: { username: current.username } })} />
        </View>
      </Row>
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

/** Poza (din galerie, decupată pătrat), numele, emailul și descrierea scurtă de pe profil. */
function ProfileHeader({ user }: { user: User }) {
  const { t, formatDate } = useI18n();
  const avatar = useAvatar();
  const updateBio = useUpdateBio();
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState(user.bio ?? '');
  const [error, setError] = useState<string | null>(null);

  const pickPhoto = async () => {
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], shape: 'oval', quality: 1,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      // Pătratul din centru, cel mult 512 px (serverul îl reface oricum la 256×256 și scoate metadatele).
      const context = ImageManipulator.manipulate(asset.uri);
      const side = Math.min(asset.width || 0, asset.height || 0);
      if (side > 0 && asset.width !== asset.height) {
        context.crop({ originX: Math.floor((asset.width - side) / 2), originY: Math.floor((asset.height - side) / 2), width: side, height: side });
      }
      if (side === 0 || side > 512) context.resize({ width: 512 });
      const image = await context.renderAsync();
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });
      if (!saved.base64) throw new Error(t('error.unexpected'));
      await avatar.mutateAsync(saved.base64);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const removePhoto = async () => {
    if (!(await confirmAction(t('profile.removePhotoTitle'), t('profile.removePhotoText'), t('profile.removePhoto')))) return;
    setError(null);
    try {
      await avatar.mutateAsync(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const saveBio = async () => {
    setError(null);
    try {
      const saved = await updateBio.mutateAsync(bio.trim());
      setBio(saved.bio ?? '');
      setEditing(false);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Card>
      <Row gap={14}>
        <Avatar username={user.username} name={user.fullName} version={user.avatarVersion} size={72} />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="heading">{user.fullName}</AppText>
          <AppText variant="muted">{user.email}</AppText>
          <Row style={{ flexWrap: 'wrap' }} gap={6}>
            <Badge text={user.role === 'ADMIN' ? t('role.admin') : t('role.user')} tone={user.role === 'ADMIN' ? 'accent' : 'neutral'} />
            {user.lastActiveOn ? (
              <Badge text={t('profile.lastActive', { date: formatDate(user.lastActiveOn, { inline: true }) })} />
            ) : null}
          </Row>
        </View>
      </Row>
      <Row style={{ flexWrap: 'wrap' }} gap={8}>
        <Button compact variant="secondary" icon="image-outline" loading={avatar.isPending}
          title={user.avatarVersion ? t('profile.changePhoto') : t('profile.addPhoto')} onPress={pickPhoto} />
        {user.avatarVersion ? <Button compact variant="ghost" title={t('profile.removePhoto')} onPress={removePhoto} /> : null}
      </Row>
      {error ? <Banner text={error} onClose={() => setError(null)} /> : null}
      {editing ? (
        <View style={{ gap: 8 }}>
          <TextField label={t('profile.bioLabel')} value={bio} onChangeText={setBio} maxLength={160} multiline
            placeholder={t('profile.bioPlaceholder')} />
          <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <AppText variant="small">{bio.length}/160</AppText>
            <Row gap={8}>
              <Button compact variant="ghost" title={t('common.cancel')} onPress={() => { setBio(user.bio ?? ''); setEditing(false); }} />
              <Button compact icon="checkmark" title={t('profile.saveBio')} loading={updateBio.isPending} onPress={saveBio} />
            </Row>
          </Row>
        </View>
      ) : (
        <View style={{ gap: 6 }}>
          <AppText variant={user.bio ? 'body' : 'muted'}>{user.bio || t('profile.bioEmpty')}</AppText>
          <Button compact variant="ghost" icon="create-outline" title={user.bio ? t('profile.editBio') : t('profile.addBio')}
            onPress={() => { setBio(user.bio ?? ''); setEditing(true); }} style={{ alignSelf: 'flex-start' }} />
        </View>
      )}
    </Card>
  );
}

/** Toate insignele mele, cu progresul (le calculează serverul pe profilul public). */
function MyBadges({ username }: { username: string }) {
  const profile = useProfile(username);
  if (!profile.data?.badges) return null;
  return <BadgeGrid badges={profile.data.badges} showLocked />;
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
