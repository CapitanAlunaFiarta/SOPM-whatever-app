import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import {
  ChatComposer, MessageMenu, MessageOptionsButton, MessageShell, ReactionChips, ReplyQuote, runMessageAction, useChatState,
} from '@/components/ChatParts';
import { openProfile } from '@/components/JoinRequests';
import { colors, radius } from '@/components/theme';
import { AppText, Banner, Card, EmptyState, Loading, Row, Screen } from '@/components/ui';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { confirmAction } from '@/lib/dialogs';
import { useDeleteDirect, useDirectMessages, useReactDirect, useSendDirect } from '@/lib/queries';
import type { DirectMessage } from '@/lib/types';

/**
 * Conversația privată cu un prieten: doar voi doi vedeți mesajele. Se poate scrie cât sunteți prieteni (după aceea
 * rămâne de citit). Ca în celelalte chaturi, cel mai nou mesaj e sus; sub ultimul meu mesaj scrie dacă l-a văzut.
 */
export default function DirectChatScreen() {
  const { t, formatTime } = useI18n();
  const params = useLocalSearchParams<{ username: string }>();
  const username = String(params.username ?? '').replace(/^@/, '');
  const thread = useDirectMessages(username);
  const send = useSendDirect(username);
  const react = useReactDirect(username);
  const remove = useDeleteDirect(username);
  const state = useChatState<DirectMessage>();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (thread.isLoading) return <Loading />;
  const data = thread.data;
  if (!data) {
    return (
      <Screen>
        <Card><EmptyState icon="alert-circle-outline" title={errorMessage(thread.error)} /></Card>
      </Screen>
    );
  }

  const person = data.with;
  const newestFirst = [...data.messages].reverse();
  const lastMine = newestFirst.find((message) => message.mine)?.id;
  const target = state.menuFor;
  const toggleReaction = (id: number, emoji: string) =>
    runMessageAction(t('card.actionFailed'), () => react.mutateAsync({ id, emoji }));

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

  return (
    <Screen refreshing={thread.isRefetching} onRefresh={() => thread.refetch()}>
      <Stack.Screen options={{ title: person.fullName }} />
      <Pressable accessibilityRole="link" accessibilityLabel={t('chat.openProfile', { name: person.fullName })}
        onPress={() => openProfile(person.username)} style={({ pressed }) => [styles.person, pressed && { opacity: 0.8 }]}>
        <Avatar username={person.username} name={person.fullName} version={person.avatarVersion} size={44} />
        <View style={{ flex: 1, gap: 1 }}>
          <Text style={styles.personName} numberOfLines={1}>{person.fullName}</Text>
          <AppText variant="small">@{person.username}</AppText>
        </View>
      </Pressable>

      {error || thread.error ? <Banner text={error ?? errorMessage(thread.error)} onClose={() => setError(null)} /> : null}
      {data.canWrite ? (
        <ChatComposer value={text} onChangeText={setText} onSubmit={submit} placeholder={t('dm.placeholder')}
          sending={send.isPending} replyTo={state.replyTo} onCancelReply={state.clearReply} inputRef={state.inputRef} />
      ) : <Banner tone="info" text={t('dm.readOnly')} />}

      {newestFirst.length === 0 ? (
        <Card><EmptyState icon="chatbubble-ellipses-outline" title={t('chat.emptyTitle')} text={t('dm.emptyText')} /></Card>
      ) : (
        <View style={{ gap: 10 }}>
          {newestFirst.map((message) => (
            <Bubble key={message.id} message={message} time={formatTime(message.createdAt)}
              status={message.id === lastMine ? t(message.read ? 'message.seen' : 'message.sent') : undefined}
              onOptions={() => state.openMenu(message)} onReact={(emoji) => toggleReaction(message.id, emoji)} />
          ))}
        </View>
      )}

      <MessageMenu open={Boolean(target)} author={target?.fullName ?? ''} text={target?.text ?? ''}
        reactions={target?.reactions} onClose={state.closeMenu}
        onReact={target ? (emoji) => toggleReaction(target.id, emoji) : undefined}
        onReply={target && data.canWrite ? () => state.reply({ id: target.id, fullName: target.fullName, text: target.text }) : undefined}
        onDelete={target?.mine ? async () => {
          if (await confirmAction(t('chat.deleteConfirm'), target.text, t('common.delete'))) {
            runMessageAction(t('card.actionFailed'), () => remove.mutateAsync(target.id));
            if (state.replyTo?.id === target.id) state.clearReply();
          }
        } : undefined} />
    </Screen>
  );
}

/** Un mesaj ca bulă: ale mele în dreapta (violet), ale celuilalt în stânga. */
function Bubble({ message, time, status, onOptions, onReact }: {
  message: DirectMessage; time: string; status?: string; onOptions: () => void; onReact: (emoji: string) => void;
}) {
  const mine = message.mine;
  return (
    <MessageShell onLongPress={onOptions} style={[styles.line, mine ? styles.lineMine : styles.lineTheirs]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        {message.replyTo ? <ReplyQuote reply={message.replyTo} onDark={mine} /> : null}
        <Text style={styles.text}>{message.text}</Text>
      </View>
      <ReactionChips reactions={message.reactions} onToggle={onReact} align={mine ? 'flex-end' : 'flex-start'} />
      <Row gap={2} style={{ justifyContent: mine ? 'flex-end' : 'flex-start' }}>
        <AppText variant="small">{status ? `${time} · ${status}` : time}</AppText>
        <MessageOptionsButton name={message.fullName} onPress={onOptions} />
      </Row>
    </MessageShell>
  );
}

const styles = StyleSheet.create({
  person: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  personName: { color: colors.text, fontWeight: '800', fontSize: 16 },
  line: { gap: 4, maxWidth: '86%' },
  lineMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  lineTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { gap: 6, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 16 },
  bubbleMine: { backgroundColor: `${colors.violet}40`, borderWidth: 1, borderColor: `${colors.violet}88`, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
  text: { color: colors.text, fontSize: 15, lineHeight: 21 },
});
