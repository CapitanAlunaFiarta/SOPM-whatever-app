import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/components/theme';
import { AppText, Banner, Button, Card, EmptyState, Loading, Row, Screen, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { localDate } from '@/lib/dates';
import { useSendTaskMessage, useTaskMessages, useTasks } from '@/lib/queries';

/**
 * Chatul unei activități de grup, separat de chatul general. Se deschide după ce un prieten acceptă
 * invitația și devine doar de citit la 5 zile după ce toți au confirmat (sau după anulare).
 */
export default function ActivityChatScreen() {
  const { t, formatDate, formatTime } = useI18n();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const taskId = Number(id);
  const tasks = useTasks();
  const task = tasks.data?.find((item) => item.id === taskId);
  const available = Boolean(task?.chat?.available);
  const messages = useTaskMessages(taskId, available);
  const send = useSendTaskMessage(taskId);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (tasks.isLoading) return <Loading />;
  if (!task) {
    return (
      <Screen>
        <Card><EmptyState icon="alert-circle-outline" title={t('task.notFoundTitle')} text={t('task.notFoundText')} /></Card>
      </Screen>
    );
  }

  const closesOn = task.chat.closesAt
    ? formatDate(localDate(0, new Date(task.chat.closesAt)), { absolute: true }) : null;
  const people = task.participants ?? [];
  const ownerConfirmed = task.confirmedCount - people.filter((person) => person.confirmed).length > 0;
  const members = [
    { username: task.ownerUsername, fullName: task.ownerName, owner: true, done: ownerConfirmed,
      status: t(ownerConfirmed ? 'group.statusConfirmed' : 'group.statusPending') },
    ...people.map((person) => ({
      username: person.username, fullName: person.fullName, owner: false, done: person.confirmed,
      status: t(person.status === 'INVITED' ? 'group.statusInvited' : person.status === 'DECLINED' ? 'group.statusDeclined'
        : person.confirmed ? 'group.statusConfirmed' : 'group.statusPending'),
    })),
  ];
  const newestFirst = [...(messages.data ?? [])].reverse();

  const submit = async () => {
    if (!text.trim()) return;
    try {
      await send.mutateAsync(text.trim());
      setText('');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen refreshing={messages.isRefetching} onRefresh={() => { messages.refetch(); tasks.refetch(); }}>
      <Stack.Screen options={{ title: task.title }} />
      <Card>
        <AppText variant="heading">{t('group.members')}</AppText>
        {members.map((member) => (
          <Row key={member.username} style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={styles.member} numberOfLines={1}>
                {member.username === user?.username ? t('leaderboard.you', { name: member.fullName }) : member.fullName}
              </Text>
              <Text style={styles.handle} numberOfLines={1}>
                @{member.username}{member.owner ? ` · ${t('group.statusOwner')}` : ''}
              </Text>
            </View>
            <Text style={[styles.status, member.done && { color: colors.green }]}>{member.status}</Text>
          </Row>
        ))}
      </Card>

      {!available ? (
        <Card><EmptyState icon="chatbubbles-outline" title={t('group.chatPending')} /></Card>
      ) : (
        <>
          {task.chat.readOnly
            ? <Banner tone="info" text={t('group.chatClosed', { date: closesOn ?? '' })} />
            : closesOn ? <Banner tone="info" text={t('group.chatClosesOn', { date: closesOn })} /> : null}
          {error || messages.error
            ? <Banner text={error ?? errorMessage(messages.error)} onClose={() => setError(null)} /> : null}
          {!task.chat.readOnly && (
            <Row>
              <View style={{ flex: 1 }}>
                <TextField value={text} onChangeText={setText} placeholder={t('group.chatPlaceholder')} maxLength={2000}
                  onSubmitEditing={submit} returnKeyType="send" />
              </View>
              <Button title={t('chat.send')} icon="send" compact loading={send.isPending} onPress={submit} />
            </Row>
          )}
          {newestFirst.length === 0 && !messages.isLoading ? (
            <Card><EmptyState icon="chatbubble-ellipses-outline" title={t('chat.emptyTitle')} text={t('group.chatEmptyText')} /></Card>
          ) : (
            <Card style={{ gap: 0, paddingVertical: 6 }}>
              {newestFirst.map((message, index) => (
                <View key={message.id} style={[styles.message, index > 0 && styles.separator]}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text style={[styles.sender, message.mine && { color: colors.violet }]} numberOfLines={1}>
                      {message.fullName} <Text style={styles.handle}>@{message.username}</Text>
                    </Text>
                    <AppText variant="small">{formatTime(message.createdAt)}</AppText>
                  </Row>
                  <AppText>{message.text}</AppText>
                </View>
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  member: { color: colors.text, fontWeight: '700' },
  handle: { color: colors.faint, fontWeight: '500', fontSize: 13 },
  status: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  message: { paddingVertical: 10, gap: 4 },
  separator: { borderTopWidth: 1, borderTopColor: colors.border },
  sender: { color: colors.cyan, fontWeight: '800', flexShrink: 1 },
});
