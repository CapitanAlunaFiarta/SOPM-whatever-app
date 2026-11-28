import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChatComposer, MessageMenu, runMessageAction, useChatState } from '@/components/ChatParts';
import { CommunityMessage, communityText } from '@/components/CommunityMessage';
import { colors, radius } from '@/components/theme';
import { AppText, Banner, Button, Card, EmptyState, Row, Screen } from '@/components/ui';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { communityChatKey, markSeen } from '@/lib/chatSeen';
import { confirmAction } from '@/lib/dialogs';
import {
  useActivityPreviews, useChat, useDeleteChat, useReactChat, useSendChat, useShareActivity, useShareStreak, useTasks,
} from '@/lib/queries';
import type { ChatMessage } from '@/lib/types';

/**
 * Chatul comunității: mesaje, streak-uri arătate și invitații la activități de grup (oricine cere să participe,
 * organizatorul aprobă). Apăsarea pe un nume deschide profilul persoanei, de unde o poți adăuga la prieteni.
 * La orice mesaj poți reacționa sau răspunde (meniul „…” sau apăsarea lungă pe telefon).
 */
export default function CommunityChatScreen() {
  const { t } = useI18n();
  const { user } = useAuth();
  const chat = useChat();
  const send = useSendChat();
  const remove = useDeleteChat();
  const react = useReactChat();
  const shareStreak = useShareStreak();
  const state = useChatState<ChatMessage>();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const messages = chat.data ?? [];
  const newest = messages[0]?.id;
  const activityIds = messages.filter((message) => message.kind === 'ACTIVITY' && message.payload?.taskId)
    .map((message) => Number(message.payload?.taskId));
  const previews = useActivityPreviews(activityIds);
  const previewById = new Map((previews.data ?? []).map((preview) => [preview.id, preview]));
  const byId = new Map(messages.map((message) => [message.id, message]));
  const target = state.menuFor;
  const canDelete = (message: ChatMessage) => user?.role === 'ADMIN'
    || (message.senderRole !== 'SYSTEM' && message.senderUsername === user?.username);
  const toggleReaction = (id: number, emoji: string) =>
    runMessageAction(t('card.actionFailed'), () => react.mutateAsync({ id, emoji }));

  // Ce e afișat aici e citit: lista de chaturi nu-l mai arată ca nou.
  useEffect(() => {
    markSeen(communityChatKey, newest);
  }, [newest]);

  const submit = async () => {
    if (!text.trim()) return;
    setError(null);
    try {
      await send.mutateAsync({ text: text.trim(), replyTo: state.replyTo?.id });
      setText('');
      state.clearReply();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const showStreak = async () => {
    setError(null);
    setNotice(null);
    try {
      await shareStreak.mutateAsync();
      setNotice(t('community.shareStreakDone'));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Screen refreshing={chat.isRefetching} onRefresh={() => { chat.refetch(); previews.refetch(); }}>
      {error || chat.error ? <Banner text={error ?? errorMessage(chat.error)} onClose={() => setError(null)} /> : null}
      {notice ? <Banner tone="success" text={notice} onClose={() => setNotice(null)} /> : null}
      <ChatComposer value={text} onChangeText={setText} onSubmit={submit} placeholder={t('chat.placeholder')}
        sending={send.isPending} replyTo={state.replyTo} onCancelReply={state.clearReply} inputRef={state.inputRef} />
      <Row style={{ flexWrap: 'wrap' }} gap={8}>
        <Button compact variant="secondary" icon="flame-outline" title={t('community.shareStreak')}
          loading={shareStreak.isPending} onPress={showStreak} />
        <Button compact variant={picking ? 'primary' : 'secondary'} icon="megaphone-outline" title={t('community.inviteActivity')}
          onPress={() => setPicking((value) => !value)} />
      </Row>
      {picking && (
        <ActivityPicker onShared={() => { setPicking(false); setNotice(t('community.shared')); }} onError={setError} />
      )}

      {messages.length === 0 && !chat.isLoading ? (
        <Card><EmptyState icon="chatbubble-ellipses-outline" title={t('chat.emptyTitle')} text={t('chat.emptyText')} /></Card>
      ) : (
        <Card style={{ gap: 0, paddingVertical: 6 }}>
          {messages.map((message, index) => (
            <View key={message.id} style={index > 0 ? styles.separator : undefined}>
              <CommunityMessage message={message} previewsLoading={previews.isLoading}
                preview={message.payload?.taskId ? previewById.get(Number(message.payload.taskId)) : undefined}
                mine={message.senderUsername === user?.username}
                quoteText={message.replyTo && byId.has(message.replyTo.id) ? communityText(byId.get(message.replyTo.id)!, t) : undefined}
                onOptions={() => state.openMenu(message)}
                onReact={(emoji) => toggleReaction(message.id, emoji)} />
            </View>
          ))}
        </Card>
      )}
      <MessageMenu open={Boolean(target)} author={target?.senderName ?? ''} text={target ? communityText(target, t) : ''}
        reactions={target?.reactions} onClose={state.closeMenu}
        onReact={target ? (emoji) => toggleReaction(target.id, emoji) : undefined}
        onReply={target ? () => state.reply({ id: target.id, fullName: target.senderName, text: communityText(target, t) }) : undefined}
        onDelete={target && canDelete(target) ? async () => {
          if (await confirmAction(t('chat.deleteConfirm'), communityText(target, t), t('common.delete'))) {
            runMessageAction(t('card.actionFailed'), () => remove.mutateAsync(target.id));
            if (state.replyTo?.id === target.id) state.clearReply();
          }
        } : undefined} />
    </Screen>
  );
}

/** Activitățile pe care le organizez și care încă se pot face: una dintre ele devine invitație în chat. */
function ActivityPicker({ onShared, onError }: { onShared: () => void; onError: (message: string) => void }) {
  const { t, formatDate } = useI18n();
  const tasks = useTasks();
  const share = useShareActivity();
  const shareable = (tasks.data ?? []).filter((task) => task.isOwner && task.status === 'Upcoming');

  const pick = async (id: number) => {
    try {
      await share.mutateAsync(id);
      onShared();
    } catch (e) {
      onError(errorMessage(e));
    }
  };

  return (
    <Card>
      <AppText variant="heading">{t('community.pickActivity')}</AppText>
      <AppText variant="small">{t('community.pickHint')}</AppText>
      {tasks.isLoading ? <AppText variant="muted">{t('common.loading')}</AppText>
        : shareable.length === 0 ? (
          <View style={{ gap: 8 }}>
            <AppText variant="muted">{t('community.noShareable')}</AppText>
            <Button compact variant="secondary" icon="add" title={t('task.newTitle')} onPress={() => router.push('/task/new')} />
          </View>
        ) : shareable.map((task) => (
          <Pressable key={task.id} accessibilityRole="button" accessibilityLabel={task.title} disabled={share.isPending}
            onPress={() => pick(task.id)} style={({ pressed }) => [styles.option, pressed && { opacity: 0.8 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.optionTitle} numberOfLines={1}>{task.title}</Text>
              <AppText variant="small">
                {formatDate(task.dueDate)} · {t('activityCard.members', { count: task.memberCount, max: task.maxMembers ?? 30 })}
              </AppText>
            </View>
            <Text style={styles.optionAction}>{t('card.shareConfirm')}</Text>
          </Pressable>
        ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  separator: { borderTopWidth: 1, borderTopColor: colors.border },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md,
    backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border,
  },
  optionTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  optionAction: { color: colors.cyan, fontWeight: '800' },
});
