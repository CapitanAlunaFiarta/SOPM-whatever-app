import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { AppText, Badge, Banner, Button, Card, Row, Screen, StatTile, TextField } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { disableBiometrics, enableBiometrics, getBiometricStatus } from '@/lib/biometrics';
import { friendlyDate, pluralDays } from '@/lib/dates';
import { confirmAction } from '@/lib/dialogs';
import { useChangePassword, useMe } from '@/lib/queries';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const me = useMe();
  const current = me.data ?? user;
  if (!current) return null;

  return (
    <Screen title="Profil" subtitle={`@${current.username}`} refreshing={me.isRefetching} onRefresh={() => me.refetch()}>
      <Card>
        <AppText variant="heading">{current.fullName}</AppText>
        <AppText variant="muted">{current.email}</AppText>
        <Row style={{ flexWrap: 'wrap' }}>
          <Badge text={current.role === 'ADMIN' ? 'Administrator' : 'Utilizator'} tone={current.role === 'ADMIN' ? 'accent' : 'neutral'} />
          {current.lastActiveOn ? <Badge text={`Activ ultima dată: ${friendlyDate(current.lastActiveOn).toLowerCase()}`} /> : null}
        </Row>
      </Card>
      <Row style={{ flexWrap: 'wrap' }}>
        <StatTile label="Streak" value={`🔥 ${current.streak}`} hint={pluralDays(current.streak)} tone="warning" />
        <StatTile label="Puncte" value={current.points} hint="activități finalizate" tone="success" />
        <StatTile label="Freeze" value={`${current.freezesLeft}/3`} hint="se reîncarcă lunar" tone="info" />
      </Row>
      <BiometricsCard userId={current.id} />
      <PasswordCard />
      <Button variant="secondary" title="Deconectează-te" icon="log-out-outline" onPress={async () => {
        if (await confirmAction('Te deconectezi?', 'Va trebui să te autentifici din nou.', 'Deconectează')) await signOut();
      }} />
    </Screen>
  );
}

function BiometricsCard({ userId }: { userId: number }) {
  const client = useQueryClient();
  const status = useQuery({ queryKey: ['biometrics', userId], queryFn: () => getBiometricStatus(userId) });
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
        setNotice(web ? 'Passkey-ul nu va mai fi folosit în acest browser.' : 'Biometria a fost dezactivată pe acest telefon.');
      } else {
        await enableBiometrics(userId);
        setNotice(web ? 'Passkey activat. Îl vei folosi la activitățile care cer biometrie.' : 'Biometria e activă pe acest telefon.');
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
      <AppText variant="heading">{web ? 'Passkey' : 'Biometrie'}</AppText>
      <AppText variant="muted">
        {web
          ? 'Activitățile cu „biometrie” se confirmă pe web cu un passkey (amprentă, Face ID sau Windows Hello).'
          : 'Telefonul păstrează o cheie securizată, deblocată doar cu amprenta sau Face ID. Serverul verifică semnătura la fiecare confirmare.'}
      </AppText>
      {error ? <Banner text={error} onClose={() => setError(null)} /> : null}
      {notice ? <Banner tone="success" text={notice} onClose={() => setNotice(null)} /> : null}
      {status.data && !status.data.available ? (
        <Banner tone="info" text={status.data.hint ?? 'Indisponibil pe acest dispozitiv.'} />
      ) : (
        <View style={{ gap: 8 }}>
          <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Badge text={status.data?.enabled ? 'Activă pe acest dispozitiv' : 'Neactivată pe acest dispozitiv'}
              tone={status.data?.enabled ? 'success' : 'neutral'} icon="finger-print" />
            <Button compact variant={status.data?.enabled ? 'secondary' : 'primary'} loading={busy}
              title={status.data?.enabled ? 'Dezactivează' : 'Activează'} icon="finger-print" onPress={toggle} />
          </Row>
          {status.data?.label ? <AppText variant="small">{status.data.label}</AppText> : null}
        </View>
      )}
    </Card>
  );
}

function PasswordCard() {
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setNotice(null);
    if (next.length < 12) {
      setError('Parola nouă trebuie să aibă cel puțin 12 caractere.');
      return;
    }
    try {
      setNotice(await change.mutateAsync({ currentPassword: current, newPassword: next }));
      setCurrent('');
      setNext('');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Card>
      <AppText variant="heading">Schimbă parola</AppText>
      {error ? <Banner text={error} onClose={() => setError(null)} /> : null}
      {notice ? <Banner tone="success" text={notice} onClose={() => setNotice(null)} /> : null}
      <TextField label="Parola actuală" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
      <TextField label="Parola nouă (minim 12 caractere)" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" />
      <Button variant="secondary" title="Salvează parola" icon="key-outline" loading={change.isPending} onPress={submit} />
    </Card>
  );
}
