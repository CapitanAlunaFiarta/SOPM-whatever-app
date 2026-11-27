import { useMemo, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { colors } from '@/components/theme';
import { AppText, Badge, Banner, Button, Card, EmptyState, Row, Screen, TextField } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirmAction } from '@/lib/dialogs';
import { useAdminAction, useAdminUsers } from '@/lib/queries';
import type { AdminUser } from '@/lib/types';

export default function AdminScreen() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const users = useAdminUsers(isAdmin);
  const action = useAdminAction();
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [passwordFor, setPasswordFor] = useState<AdminUser | null>(null);

  const visible = useMemo(() => (users.data ?? []).filter((item) =>
    `${item.fullName} ${item.username} ${item.email}`.toLowerCase().includes(query.trim().toLowerCase())), [users.data, query]);

  if (!isAdmin) {
    return <Screen title="Admin"><Card><EmptyState icon="lock-closed-outline" title="Acces interzis" /></Card></Screen>;
  }

  const run = async (target: AdminUser, kind: 'bonus-streak' | 'reset-freezes' | 'delete') => {
    if (kind === 'delete' && !(await confirmAction('Ștergi contul?', `${target.fullName} (@${target.username}) și toate activitățile lui.`, 'Șterge'))) return;
    setError(null);
    try {
      await action.mutateAsync({ email: target.email, action: kind });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen title="Administrare" subtitle={`${users.data?.length ?? 0} conturi`} refreshing={users.isRefetching}
      onRefresh={() => users.refetch()}>
      {error || users.error ? <Banner text={error ?? errorMessage(users.error)} onClose={() => setError(null)} /> : null}
      <TextField value={query} onChangeText={setQuery} placeholder="Caută după nume, username sau email…" autoCapitalize="none" />
      {visible.map((item) => (
        <Card key={item.id}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <AppText variant="heading">{item.fullName}</AppText>
              <AppText variant="muted">@{item.username} · {item.email}</AppText>
            </View>
            <Badge text={item.role} tone={item.role === 'ADMIN' ? 'accent' : 'neutral'} />
          </Row>
          <AppText variant="small">🔥 {item.streak} · ⭐ {item.points} · ❄ {item.freezesLeft}/3 · biometrie {item.biometricEnabled ? 'da' : 'nu'}</AppText>
          <Row style={{ flexWrap: 'wrap' }} gap={8}>
            <Button compact variant="secondary" title="+5 streak" onPress={() => run(item, 'bonus-streak')} />
            <Button compact variant="secondary" title="Reset freeze" onPress={() => run(item, 'reset-freezes')} />
            {item.email !== user?.email && (
              <>
                <Button compact variant="secondary" title="Parolă nouă" icon="key-outline" onPress={() => setPasswordFor(item)} />
                <Button compact variant="ghost" title="Șterge contul" icon="trash-outline" onPress={() => run(item, 'delete')} />
              </>
            )}
          </Row>
        </Card>
      ))}
      <PasswordModal target={passwordFor} onClose={() => setPasswordFor(null)} />
    </Screen>
  );
}

function PasswordModal({ target, onClose }: { target: AdminUser | null; onClose: () => void }) {
  const action = useAdminAction();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!target) return;
    if (password.length < 12) {
      setError('Parola trebuie să aibă cel puțin 12 caractere.');
      return;
    }
    try {
      await action.mutateAsync({ email: target.email, action: 'password', newPassword: password });
      setPassword('');
      setError(null);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Modal visible={Boolean(target)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Card style={styles.dialog}>
          <AppText variant="heading">Parolă nouă pentru @{target?.username}</AppText>
          <AppText variant="small">Sesiunile existente ale utilizatorului vor fi închise.</AppText>
          {error ? <Banner text={error} /> : null}
          <TextField value={password} onChangeText={setPassword} secureTextEntry placeholder="Minim 12 caractere" autoFocus />
          <Row style={{ justifyContent: 'flex-end' }}>
            <Button compact variant="ghost" title="Renunță" onPress={() => { setPassword(''); setError(null); onClose(); }} />
            <Button compact title="Salvează" loading={action.isPending} onPress={submit} />
          </Row>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  dialog: { width: '100%', maxWidth: 420, borderColor: colors.indigo },
});
