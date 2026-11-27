import { useMemo, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { colors } from '@/components/theme';
import { AppText, Badge, Banner, Button, Card, EmptyState, Row, Screen, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirmAction } from '@/lib/dialogs';
import { useAdminAction, useAdminUsers } from '@/lib/queries';
import type { AdminUser } from '@/lib/types';

export default function AdminScreen() {
  const { t, tp } = useI18n();
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
    return <Screen title={t('tabs.admin')}><Card><EmptyState icon="lock-closed-outline" title={t('admin.forbidden')} /></Card></Screen>;
  }

  const run = async (target: AdminUser, kind: 'bonus-streak' | 'reset-freezes' | 'delete') => {
    if (kind === 'delete' && !(await confirmAction(t('admin.deleteTitle'),
      t('admin.deleteText', { name: target.fullName, username: target.username }), t('common.delete')))) return;
    setError(null);
    try {
      await action.mutateAsync({ email: target.email, action: kind });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen title={t('admin.title')} subtitle={tp('plural.accounts', users.data?.length ?? 0)} refreshing={users.isRefetching}
      onRefresh={() => users.refetch()}>
      {error || users.error ? <Banner text={error ?? errorMessage(users.error)} onClose={() => setError(null)} /> : null}
      <TextField value={query} onChangeText={setQuery} placeholder={t('admin.search')} autoCapitalize="none" />
      {visible.map((item) => (
        <Card key={item.id}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <AppText variant="heading">{item.fullName}</AppText>
              <AppText variant="muted">@{item.username} · {item.email}</AppText>
            </View>
            <Badge text={item.role === 'ADMIN' ? t('role.admin') : t('role.user')} tone={item.role === 'ADMIN' ? 'accent' : 'neutral'} />
          </Row>
          <AppText variant="small">
            {t('admin.stats', {
              streak: item.streak, points: item.points, freezes: item.freezesLeft,
              biometrics: item.biometricEnabled ? t('common.yesLower') : t('common.noLower'),
            })}
          </AppText>
          <Row style={{ flexWrap: 'wrap' }} gap={8}>
            <Button compact variant="secondary" title={t('admin.bonusStreak')} onPress={() => run(item, 'bonus-streak')} />
            <Button compact variant="secondary" title={t('admin.resetFreezes')} onPress={() => run(item, 'reset-freezes')} />
            {item.email !== user?.email && (
              <>
                <Button compact variant="secondary" title={t('admin.newPassword')} icon="key-outline" onPress={() => setPasswordFor(item)} />
                <Button compact variant="ghost" title={t('admin.deleteAccount')} icon="trash-outline" onPress={() => run(item, 'delete')} />
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
  const { t } = useI18n();
  const action = useAdminAction();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!target) return;
    if (password.length < 12) {
      setError(t('password.tooShort'));
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
          <AppText variant="heading">{t('admin.passwordFor', { username: target?.username ?? '' })}</AppText>
          <AppText variant="small">{t('admin.passwordNote')}</AppText>
          {error ? <Banner text={error} /> : null}
          <TextField value={password} onChangeText={setPassword} secureTextEntry placeholder={t('password.minPlaceholder')} autoFocus />
          <Row style={{ justifyContent: 'flex-end' }}>
            <Button compact variant="ghost" title={t('common.cancel')} onPress={() => { setPassword(''); setError(null); onClose(); }} />
            <Button compact title={t('common.save')} loading={action.isPending} onPress={submit} />
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
