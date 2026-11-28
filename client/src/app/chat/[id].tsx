import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import {
  ChatComposer, MessageMenu, MessageOptionsButton, MessageShell, ReactionChips, ReplyQuote, runMessageAction, useChatState,
} from '@/components/ChatParts';
import { JoinRequests, openProfile } from '@/components/JoinRequests';
import { colors } from '@/components/theme';
import { AppText, Banner, Card, EmptyState, Loading, Row, Screen } from '@/components/ui';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { markSeen, taskChatKey } from '@/lib/chatSeen';
import { confirmAction } from '@/lib/dialogs';
import { localDate } from '@/lib/dates';
import {
  useDeleteTaskMessage, useReactTaskMessage, useSendTaskMessage, useTaskMessages, useTasks,
} from '@/lib/queries';
import type { TaskMessage } from '@/lib/types';

/**
 * Chatul unei activități de grup, separat de chatul general. Se deschide după ce un prieten acceptă
 * invitația și devine doar de citit la 5 zile după ce toți au confirmat (sau după anulare). Cât e deschis,
 * la mesaje se poate reacționa și răspunde, iar mesajele proprii se pot șterge.
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
  const react = useReactTaskMessage(taskId);
  const remove = useDeleteTaskMessage(taskId);
  const state = useChatState<TaskMessage>();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const newest = messages.data?.[messages.data.length - 1]?.id;

  // Mesajele afișate aici sunt citite: lista de chaturi nu le mai arată ca noi.
  useEffect(() => {
    markSeen(taskChatKey(taskId), newest);
  }, [taskId, newest]);

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
    { username: task.ownerUsername, fullName: task.ownerName, avatar: task.ownerAvatarVersion, owner: true, done: ownerConfirmed,
      status: t(ownerConfirmed ? 'group.statusConfirmed' : 'group.statusPending') },
    ...people.map((person) => ({
      username: person.username, fullName: person.fullName, avatar: person.avatarVersion, owner: false, done: person.confirmed,
      status: t(person.status === 'INVITED' ? 'group.statusInvited' : person.status === 'DECLINED' ? 'group.statusDeclined'
        : person.confirmed ? 'group.statusConfirmed' : 'group.statusPending'),
    })),
  ];
  const newestFirst = [...(messages.data ?? [])].reverse();
  const open = available && !task.chat.readOnly;
  const target = state.menuFor;
  const toggleReaction = (id: number, emoji: string) =>
    runMessageAction(t('card.actionFailed'), () => react.mutateAsync({ id, emoji }));

  const submit = async () => {
    if (!text.trim()) return;
    try {
      await send.mutateAsync({ text: text.trim(), replyTo: state.replyTo?.id });
      setText('');
      state.clearReply();
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
            <Avatar username={member.username} name={member.fullName} version={member.avatar} size={30} />
            <Pressable style={{ flex: 1, gap: 1 }} accessibilityRole="link"
              accessibilityLabel={t('chat.openProfile', { name: member.fullName })} onPress={() => openProfile(member.username)}>
              <Text style={styles.member} numberOfLines={1}>
                {member.username === user?.username ? t('leaderboard.you', { name: member.fullName }) : member.fullName}
              </Text>
              <Text style={styles.handle} numberOfLines={1}>
                @{member.username}{member.owner ? ` · ${t('group.statusOwner')}` : ''}
              </Text>
            </Pressable>
            <Text style={[styles.status, member.done && { color: colors.green }]}>{member.status}</Text>
          </Row>
        ))}
        {task.isOwner ? <JoinRequests task={task} /> : null}
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
          {open && (
            <ChatComposer value={text} onChangeText={setText} onSubmit={submit} placeholder={t('group.chatPlaceholder')}
              sending={send.isPending} replyTo={state.replyTo} onCancelReply={state.clearReply} inputRef={state.inputRef} />
          )}
          {newestFirst.length === 0 && !messages.isLoading ? (
            <Card><EmptyState icon="chatbubble-ellipses-outline" title={t('chat.emptyTitle')} text={t('group.chatEmptyText')} /></Card>
          ) : (
            <Card style={{ gap: 0, paddingVertical: 6 }}>
              {newestFirst.map((message, index) => (
                <View key={message.id} style={index > 0 ? styles.separator : undefined}>
                  <GroupMessage message={message} time={formatTime(message.createdAt)}
                    onOptions={open ? () => state.openMenu(message) : undefined}
                    onReact={open ? (emoji) => toggleReaction(message.id, emoji) : undefined} />
                </View>
              ))}
            </Card>
          )}
          <MessageMenu open={Boolean(target)} author={target?.fullName ?? ''} text={target?.text ?? ''}
            reactions={target?.reactions} onClose={state.closeMenu}
            onReact={target ? (emoji) => toggleReaction(target.id, emoji) : undefined}
            onReply={target ? () => state.reply({ id: target.id, fullName: target.fullName, text: target.text }) : undefined}
            onDelete={target?.mine ? async () => {
              if (await confirmAction(t('chat.deleteConfirm'), target.text, t('common.delete'))) {
                runMessageAction(t('card.actionFailed'), () => remove.mutateAsync(target.id));
                if (state.replyTo?.id === target.id) state.clearReply();
              }
            } : undefined} />
        </>
      )}
    </Screen>
  );
}

/** Un mesaj din chatul grupului: poza, numele (deschide profilul), citatul la care răspunde, textul și reacțiile. */
function GroupMessage({ message, time, onOptions, onReact }: {
  message: TaskMessage; time: string; onOptions?: () => void; onReact?: (emoji: string) => void;
}) {
  const { t } = useI18n();
  return (
    <MessageShell onLongPress={onOptions} style={styles.message}>
      <Row gap={10} style={{ alignItems: 'flex-start' }}>
        <Avatar username={message.username} name={message.fullName} version={message.avatarVersion} size={32} />
        <View style={{ flex: 1, gap: 5 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Pressable style={{ flexShrink: 1 }} accessibilityRole="link"
              accessibilityLabel={t('chat.openProfile', { name: message.fullName })} onPress={() => openProfile(message.username)}>
              <Text style={[styles.sender, message.mine && { color: colors.violet }]} numberOfLines={1}>
                {message.fullName} <Text style={styles.handle}>@{message.username}</Text>
              </Text>
            </Pressable>
            <Row gap={2}>
              <AppText variant="small">{time}</AppText>
              {onOptions ? <MessageOptionsButton name={message.fullName} onPress={onOptions} /> : null}
            </Row>
          </Row>
          {message.replyTo ? <ReplyQuote reply={message.replyTo} /> : null}
          <AppText>{message.text}</AppText>
          <ReactionChips reactions={message.reactions} onToggle={onReact} />
        </View>
      </Row>
    </MessageShell>
  );
}

const styles = StyleSheet.create({
  member: { color: colors.text, fontWeight: '700' },
  handle: { color: colors.faint, fontWeight: '500', fontSize: 13 },
  status: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  message: { paddingVertical: 10 },
  separator: { borderTopWidth: 1, borderTopColor: colors.border },
  sender: { color: colors.cyan, fontWeight: '800', flexShrink: 1 },
});
