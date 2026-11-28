import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/components/theme';
import { AppText, Badge, Banner, Button, Card, EmptyState, Loading, Row, Screen, StatTile } from '@/components/ui';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { confirmAction } from '@/lib/dialogs';
import { type FriendAction, useFriendAction, useProfile } from '@/lib/queries';

/** Profilul public al cuiva (din chat, clasament sau lista de prieteni): streak, activități și prietenia cu el. */
export default function UserProfileScreen() {
  const { t, tp, formatDate } = useI18n();
  const { username = '' } = useLocalSearchParams<{ username: string }>();
  const name = username.replace(/^@/, '');
  const profile = useProfile(name);
  const action = useFriendAction();
  const [error, setError] = useState<string | null>(null);

  if (profile.isLoading) return <Loading />;
  const person = profile.data;
  if (!person) {
    return (
      <Screen>
        <Card><EmptyState icon="person-outline" title={t('tabs.profile')} text={profile.error ? errorMessage(profile.error) : undefined} /></Card>
      </Screen>
    );
  }

  const run = async (kind: FriendAction) => {
    setError(null);
    try {
      await action.mutateAsync({ username: person.username, action: kind });
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const initials = person.fullName.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');

  return (
    <Screen refreshing={profile.isRefetching} onRefresh={() => profile.refetch()}>
      <Stack.Screen options={{ title: person.fullName }} />
      {error ? <Banner text={error} onClose={() => setError(null)} /> : null}
      <Card>
        <Row gap={14}>
          <View style={styles.avatar}><Text style={styles.initials}>{initials || '?'}</Text></View>
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="heading">{person.fullName}</AppText>
            <AppText variant="muted">@{person.username}</AppText>
          </View>
        </Row>
        <Row style={{ flexWrap: 'wrap' }} gap={6}>
          {person.role === 'ADMIN' ? <Badge text={t('role.admin')} tone="accent" /> : null}
          {person.memberSince ? (
            <Badge text={t('user.memberSince', { date: formatDate(person.memberSince, { absolute: true }) })} icon="calendar-outline" />
          ) : null}
          {person.lastActiveOn ? (
            <Badge text={t('profile.lastActive', { date: formatDate(person.lastActiveOn, { inline: true }) })} />
          ) : null}
          <Badge text={tp('plural.friends', person.friends)} icon="people-outline" />
        </Row>
      </Card>

      <Row style={{ flexWrap: 'wrap', alignItems: 'stretch' }}>
        <StatTile label={t('stats.streak')} value={`🔥 ${person.streak}`} hint={tp('plural.days', person.streak)} tone="warning" />
        <StatTile label={t('user.completed')} value={person.completed} hint={tp('plural.points', person.points)} tone="success"
          icon="checkmark-done-outline" />
      </Row>

      <Card>
        {person.relation === 'SELF' ? (
          <>
            <AppText variant="muted">{t('user.self')}</AppText>
            <Button variant="secondary" icon="person-circle-outline" title={t('tabs.profile')} onPress={() => router.push('/profile')} />
          </>
        ) : person.relation === 'FRIEND' ? (
          <>
            <Badge text={t('user.friends')} tone="success" icon="checkmark-circle" />
            <Row style={{ flexWrap: 'wrap' }}>
              <Button compact icon="hand-left-outline" title={t('favor.ask')}
                onPress={() => router.push({ pathname: '/favor/new', params: { friend: person.username } })} />
              <Button compact variant="ghost" title={t('user.removeFriend')} onPress={async () => {
                if (await confirmAction(t('friends.removeConfirm'), `@${person.username}`, t('common.delete'))) await run('remove');
              }} />
            </Row>
          </>
        ) : person.relation === 'INCOMING' ? (
          <>
            <AppText variant="muted">{t('user.incoming', { name: person.fullName })}</AppText>
            <Row style={{ flexWrap: 'wrap' }}>
              <Button compact icon="checkmark" title={t('group.accept')} loading={action.isPending} onPress={() => run('accept')} />
              <Button compact variant="ghost" title={t('group.decline')} onPress={() => run('decline')} />
            </Row>
          </>
        ) : person.relation === 'OUTGOING' ? (
          <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Badge text={t('user.requestSent')} icon="time-outline" tone="info" />
            <Button compact variant="ghost" title={t('activityCard.withdraw')} onPress={() => run('remove')} />
          </Row>
        ) : (
          <Button icon="person-add-outline" title={t('user.addFriend')} loading={action.isPending} onPress={() => run('request')} />
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: `${colors.indigo}33`, borderWidth: 1, borderColor: colors.indigo,
    alignItems: 'center', justifyContent: 'center',
  },
  initials: { color: colors.text, fontSize: 20, fontWeight: '900' },
});
