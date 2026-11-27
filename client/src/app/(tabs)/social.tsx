import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/components/theme';
import {
  AppText, Badge, Banner, Button, Card, EmptyState, IconButton, Row, Screen, Segmented, TextField,
} from '@/components/ui';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirmAction } from '@/lib/dialogs';
import {
  useChat, useDeleteChat, useFriendAction, useFriends, useLeaderboard, useSendChat,
} from '@/lib/queries';

type Section = 'chat' | 'friends' | 'leaderboard';

export default function SocialScreen() {
  const { t } = useI18n();
  const [section, setSection] = useState<Section>('chat');
  return (
    <Screen title={t('social.title')} subtitle={t('social.subtitle')}>
      <Segmented value={section} onChange={setSection} options={[
        { value: 'chat', label: t('social.chat'), icon: 'chatbubbles-outline' },
        { value: 'friends', label: t('social.friends'), icon: 'people-outline' },
        { value: 'leaderboard', label: t('social.leaderboard'), icon: 'trophy-outline' },
      ]} />
      {section === 'chat' && <ChatSection />}
      {section === 'friends' && <FriendsSection />}
      {section === 'leaderboard' && <LeaderboardSection />}
    </Screen>
  );
}

function ChatSection() {
  const { t, formatTime } = useI18n();
  const { user } = useAuth();
  const chat = useChat();
  const send = useSendChat();
  const remove = useDeleteChat();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

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
    <View style={{ gap: 12 }}>
      {error || chat.error ? <Banner text={error ?? errorMessage(chat.error)} onClose={() => setError(null)} /> : null}
      <Row>
        <View style={{ flex: 1 }}>
          <TextField value={text} onChangeText={setText} placeholder={t('chat.placeholder')} maxLength={2000}
            onSubmitEditing={submit} returnKeyType="send" />
        </View>
        <Button title={t('chat.send')} icon="send" compact loading={send.isPending} onPress={submit} />
      </Row>
      {(chat.data ?? []).length === 0 && !chat.isLoading ? (
        <Card><EmptyState icon="chatbubble-ellipses-outline" title={t('chat.emptyTitle')} text={t('chat.emptyText')} /></Card>
      ) : (
        <Card style={{ gap: 0, paddingVertical: 6 }}>
          {(chat.data ?? []).map((message, index) => (
            <View key={message.id} style={[styles.message, index > 0 && styles.separator]}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={styles.sender} numberOfLines={1}>
                  {message.senderName} <Text style={styles.handle}>@{message.senderUsername}</Text>
                  {message.senderRole === 'ADMIN' ? <Text style={styles.admin}>  {t('chat.admin')}</Text> : null}
                </Text>
                <Row gap={4}>
                  <AppText variant="small">{formatTime(message.createdAt)}</AppText>
                  {user?.role === 'ADMIN' && (
                    <IconButton icon="trash-outline" label={t('chat.deleteLabel')} tone="danger"
                      onPress={async () => {
                        if (await confirmAction(t('chat.deleteConfirm'), message.text, t('common.delete'))) remove.mutate(message.id);
                      }} />
                  )}
                </Row>
              </Row>
              <AppText>{message.text}</AppText>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

function FriendsSection() {
  const { t } = useI18n();
  const friends = useFriends();
  const action = useFriendAction();
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const add = async () => {
    const name = username.trim().replace(/^@/, '');
    if (!name) return;
    setError(null);
    try {
      await action.mutateAsync({ username: name });
      setUsername('');
      setNotice(t('friends.added', { username: name }));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <View style={{ gap: 12 }}>
      {error ? <Banner text={error} onClose={() => setError(null)} /> : null}
      {notice ? <Banner tone="success" text={notice} onClose={() => setNotice(null)} /> : null}
      <Row>
        <View style={{ flex: 1 }}>
          <TextField value={username} onChangeText={setUsername} placeholder="@username" autoCapitalize="none" onSubmitEditing={add} />
        </View>
        <Button compact title={t('friends.add')} icon="person-add-outline" loading={action.isPending} onPress={add} />
      </Row>
      <AppText variant="small">{t('friends.hint')}</AppText>
      {(friends.data ?? []).length === 0 && !friends.isLoading ? (
        <Card><EmptyState icon="people-outline" title={t('friends.emptyTitle')} text={t('friends.emptyText')} /></Card>
      ) : (friends.data ?? []).map((friend) => (
        <Card key={friend.username}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <AppText variant="heading">{friend.fullName}</AppText>
              <AppText variant="muted">@{friend.username}</AppText>
            </View>
            <AppText style={{ color: colors.amber, fontWeight: '800', fontSize: 17 }}>🔥 {friend.streak}</AppText>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <Badge tone={friend.direction === 'mutual' ? 'success' : friend.direction === 'incoming' ? 'info' : 'neutral'}
              text={t(friend.direction === 'mutual' ? 'friends.mutual' : friend.direction === 'incoming' ? 'friends.incoming' : 'friends.outgoing')} />
            <Button compact variant="ghost" title={t('common.delete')} onPress={async () => {
              if (await confirmAction(t('friends.removeConfirm'), `@${friend.username}`, t('common.delete'))) {
                action.mutate({ username: friend.username, remove: true });
              }
            }} />
          </Row>
        </Card>
      ))}
    </View>
  );
}

function LeaderboardSection() {
  const { t, tp } = useI18n();
  const { user } = useAuth();
  const leaderboard = useLeaderboard();
  return (
    <View style={{ gap: 8 }}>
      {leaderboard.error ? <Banner text={errorMessage(leaderboard.error)} /> : null}
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {(leaderboard.data ?? []).map((entry, index) => {
          const me = entry.username === user?.username;
          return (
            <Row key={entry.username} style={[styles.rank, index > 0 && styles.separator, me && styles.me]}>
              <Text style={[styles.position, index < 3 && { color: colors.amber }]}>{index + 1}</Text>
              <View style={{ flex: 1 }}>
                <AppText style={{ fontWeight: '700' }}>{me ? t('leaderboard.you', { name: entry.fullName }) : entry.fullName}</AppText>
                <AppText variant="small">@{entry.username} · {tp('plural.points', entry.points)}</AppText>
              </View>
              <AppText style={{ color: colors.amber, fontWeight: '800' }}>🔥 {tp('plural.days', entry.streak)}</AppText>
            </Row>
          );
        })}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  message: { paddingVertical: 10, gap: 4 },
  separator: { borderTopWidth: 1, borderTopColor: colors.border },
  sender: { color: colors.cyan, fontWeight: '800', flexShrink: 1 },
  handle: { color: colors.faint, fontWeight: '500' },
  admin: { color: colors.violet, fontWeight: '800', fontSize: 12 },
  rank: { paddingVertical: 10, paddingHorizontal: 4 },
  me: { backgroundColor: `${colors.indigo}22`, borderRadius: 10 },
  position: { width: 28, color: colors.muted, fontWeight: '900', fontSize: 16 },
});
