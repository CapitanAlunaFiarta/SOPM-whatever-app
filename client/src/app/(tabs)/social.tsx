import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CATEGORY_ICONS, isCategory } from '@/components/categories';
import { communityPreview } from '@/components/CommunityMessage';
import { FavorsSection } from '@/components/FavorsSection';
import { openProfile } from '@/components/JoinRequests';
import { colors, radius } from '@/components/theme';
import {
  AppText, Badge, Banner, Button, Card, ChipGroup, EmptyState, type IconName, Row, Screen, Segmented, TextField,
} from '@/components/ui';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { communityChatKey, taskChatKey, useSeenChats } from '@/lib/chatSeen';
import { confirmAction } from '@/lib/dialogs';
import {
  isFriend, useActivityChats, useChat, useFriendAction, useFriends, useLeaderboard,
} from '@/lib/queries';
import type { Friend } from '@/lib/types';

const SECTIONS = ['chat', 'friends', 'favors', 'leaderboard'] as const;
type Section = (typeof SECTIONS)[number];
const isSection = (value: unknown): value is Section => SECTIONS.includes(value as Section);

export default function SocialScreen() {
  const { t } = useI18n();
  // Acasă poate deschide direct o secțiune: /social?section=favors.
  const params = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState<Section>(isSection(params.section) ? params.section : 'chat');
  // Dacă se ajunge din nou aici cu altă secțiune în adresă, o deschidem (ajustare în timpul randării,
  // fără efect: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [requested, setRequested] = useState(params.section);
  if (params.section !== requested) {
    setRequested(params.section);
    if (isSection(params.section)) setSection(params.section);
  }
  // Trage în jos ca să reîmprospătezi tot ce e pe ecran (chaturi, prieteni, favoruri, clasament).
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    await client.refetchQueries({ type: 'active' }).catch(() => undefined);
    setRefreshing(false);
  };
  return (
    <Screen title={t('social.title')} subtitle={t('social.subtitle')} refreshing={refreshing} onRefresh={refresh}>
      <Segmented value={section} onChange={setSection} options={[
        { value: 'chat', label: t('social.chat'), icon: 'chatbubbles-outline' },
        { value: 'friends', label: t('social.friends'), icon: 'people-outline' },
        { value: 'favors', label: t('social.favors'), icon: 'hand-left-outline' },
        { value: 'leaderboard', label: t('social.leaderboard'), icon: 'trophy-outline' },
      ]} />
      {section === 'chat' && <ChatList />}
      {section === 'friends' && <FriendsSection />}
      {section === 'favors' && <FavorsSection />}
      {section === 'leaderboard' && <LeaderboardSection />}
    </Screen>
  );
}

/** Toate chaturile mele: comunitatea și chaturile activităților de grup, cu ultimul mesaj și ce e nou. */
function ChatList() {
  const { t, tp, formatTime } = useI18n();
  const { user } = useAuth();
  const community = useChat();
  const chats = useActivityChats();
  const { seen } = useSeenChats();
  const latest = community.data?.[0];
  const communityUnread = Boolean(latest && latest.senderUsername !== user?.username
    && latest.id > (seen[communityChatKey] ?? 0));
  const error = community.error ?? chats.error;

  return (
    <View style={{ gap: 10 }}>
      {error ? <Banner text={errorMessage(error)} /> : null}
      <ChatRow icon="people" tone={colors.violet} title={t('chats.community')} unread={communityUnread}
        preview={latest ? communityPreview(latest, t) : t('chats.communityHint')}
        time={latest ? formatTime(latest.createdAt) : undefined}
        onPress={() => router.push('/chat/community')} />

      <AppText variant="heading" style={{ marginTop: 6 }}>{t('chats.activities')}</AppText>
      {(chats.data ?? []).length === 0 && !chats.isLoading ? (
        <Card><EmptyState icon="chatbubbles-outline" title={t('chats.noMessages')} text={t('chats.activitiesEmpty')} /></Card>
      ) : (chats.data ?? []).map((item) => {
        const last = item.lastMessage;
        const unread = Boolean(last && !last.mine && last.id > (seen[taskChatKey(item.taskId)] ?? 0));
        const category = isCategory(item.category) ? item.category : 'CHORES';
        return (
          <ChatRow key={item.taskId} icon={CATEGORY_ICONS[category] ?? 'chatbubbles-outline'} tone={colors.cyan}
            title={item.title} unread={unread} time={last ? formatTime(last.createdAt) : undefined}
            preview={last ? `${last.mine ? t('chats.you') : last.fullName}: ${last.text}` : t('chats.noMessages')}
            meta={`${tp('plural.members', item.memberCount)}${item.readOnly ? ` · ${t('chats.closed')}` : ''}`}
            onPress={() => router.push(`/chat/${item.taskId}`)} />
        );
      })}
    </View>
  );
}

function ChatRow({ icon, tone, title, preview, time, meta, unread, onPress }: {
  icon: IconName; tone: string; title: string; preview: string; time?: string; meta?: string; unread?: boolean;
  onPress: () => void;
}) {
  const { t } = useI18n();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={unread ? `${title}, ${t('chats.unread')}` : title} onPress={onPress}
      style={({ pressed }) => [styles.chatRow, unread && styles.chatRowUnread, pressed && { opacity: 0.8 }]}>
      <View style={[styles.chatIcon, { backgroundColor: `${tone}22` }]}>
        <Ionicons name={icon} size={20} color={tone} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Row style={{ justifyContent: 'space-between' }} gap={8}>
          <Text style={styles.chatTitle} numberOfLines={1}>{title}</Text>
          {time ? <Text style={[styles.chatTime, unread && { color: colors.cyan }]}>{time}</Text> : null}
        </Row>
        <Row style={{ justifyContent: 'space-between' }} gap={8}>
          <Text style={[styles.chatPreview, unread && { color: colors.text }]} numberOfLines={1}>{preview}</Text>
          {unread ? <View style={styles.dot} /> : null}
        </Row>
        {meta ? <Text style={styles.chatMeta}>{meta}</Text> : null}
      </View>
    </Pressable>
  );
}

function FriendsSection() {
  const { t } = useI18n();
  const friends = useFriends();
  const action = useFriendAction();
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const all = friends.data ?? [];
  const incoming = all.filter((friend) => friend.status === 'INCOMING');
  const outgoing = all.filter((friend) => friend.status === 'OUTGOING');
  const accepted = all.filter(isFriend);

  const run = async (name: string, kind: 'request' | 'accept' | 'decline' | 'remove') => {
    setError(null);
    setNotice(null);
    try {
      const result = await action.mutateAsync({ username: name, action: kind });
      if (kind === 'request') {
        setUsername('');
        setNotice(result.status === 'FRIEND' ? t('friends.nowFriends', { username: name }) : t('friends.requestSent', { username: name }));
      } else if (kind === 'accept') {
        setNotice(t('friends.nowFriends', { username: name }));
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const add = () => {
    const name = username.trim().replace(/^@/, '');
    if (name) void run(name, 'request');
  };

  return (
    <View style={{ gap: 12 }}>
      {error ? <Banner text={error} onClose={() => setError(null)} /> : null}
      {notice ? <Banner tone="success" text={notice} onClose={() => setNotice(null)} /> : null}
      <Row>
        <View style={{ flex: 1 }}>
          <TextField value={username} onChangeText={setUsername} placeholder="@username" autoCapitalize="none"
            autoCorrect={false} onSubmitEditing={add} returnKeyType="send" />
        </View>
        <Button compact title={t('friends.add')} icon="person-add-outline" loading={action.isPending} onPress={add} />
      </Row>
      <AppText variant="small">{t('friends.hint')}</AppText>

      {incoming.length > 0 && (
        <>
          <AppText variant="heading">{t('friends.requestsTitle')}</AppText>
          {incoming.map((friend) => (
            <Card key={friend.username} style={{ borderColor: `${colors.cyan}66` }}>
              <PersonRow friend={friend} />
              <Row style={{ flexWrap: 'wrap' }}>
                <Button compact title={t('group.accept')} icon="checkmark" onPress={() => run(friend.username, 'accept')} />
                <Button compact variant="ghost" title={t('group.decline')} onPress={() => run(friend.username, 'decline')} />
              </Row>
            </Card>
          ))}
        </>
      )}

      {accepted.length === 0 && incoming.length === 0 && outgoing.length === 0 && !friends.isLoading ? (
        <Card><EmptyState icon="people-outline" title={t('friends.emptyTitle')} text={t('friends.emptyText')} /></Card>
      ) : null}

      {accepted.length > 0 && (
        <>
          <AppText variant="heading">{t('friends.listTitle')}</AppText>
          {accepted.map((friend) => (
            <Card key={friend.username}>
              <PersonRow friend={friend} />
              <Row style={{ justifyContent: 'flex-end' }}>
                <Button compact variant="ghost" title={t('common.delete')} onPress={async () => {
                  if (await confirmAction(t('friends.removeConfirm'), `@${friend.username}`, t('common.delete'))) {
                    await run(friend.username, 'remove');
                  }
                }} />
              </Row>
            </Card>
          ))}
        </>
      )}

      {outgoing.length > 0 && (
        <>
          <AppText variant="heading">{t('friends.sentTitle')}</AppText>
          {outgoing.map((friend) => (
            <Card key={friend.username}>
              <PersonRow friend={friend} />
              <Row style={{ justifyContent: 'space-between' }}>
                <Badge text={t('friends.waiting')} icon="time-outline" />
                <Button compact variant="ghost" title={t('friends.withdraw')} onPress={() => run(friend.username, 'remove')} />
              </Row>
            </Card>
          ))}
        </>
      )}
    </View>
  );
}

/** Numele (deschide profilul) și streak-ul unui prieten sau al cuiva care ți-a cerut prietenia. */
function PersonRow({ friend }: { friend: Friend }) {
  const { t } = useI18n();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={t('chat.openProfile', { name: friend.fullName })}
      onPress={() => openProfile(friend.username)}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">{friend.fullName}</AppText>
          <AppText variant="muted">@{friend.username}</AppText>
        </View>
        <AppText style={{ color: colors.amber, fontWeight: '800', fontSize: 17 }}>🔥 {friend.streak}</AppText>
        <Ionicons name="chevron-forward" size={18} color={colors.faint} />
      </Row>
    </Pressable>
  );
}

function LeaderboardSection() {
  const { t, tp } = useI18n();
  const { user } = useAuth();
  const leaderboard = useLeaderboard();
  const friends = useFriends();
  const [scope, setScope] = useState<'all' | 'friends'>('all');
  const friendNames = new Set((friends.data ?? []).filter(isFriend).map((friend) => friend.username));
  const entries = (leaderboard.data ?? [])
    .filter((entry) => scope === 'all' || entry.username === user?.username || friendNames.has(entry.username));
  return (
    <View style={{ gap: 8 }}>
      {leaderboard.error ? <Banner text={errorMessage(leaderboard.error)} /> : null}
      <ChipGroup options={['all', 'friends'] as const} value={scope} onChange={setScope}
        labels={{ all: t('leaderboard.all'), friends: t('leaderboard.friendsOnly') }} />
      {scope === 'friends' && friendNames.size === 0 ? <AppText variant="small">{t('leaderboard.noFriends')}</AppText> : null}
      <Card style={{ gap: 0, paddingVertical: 4 }}>
        {entries.map((entry, index) => {
          const me = entry.username === user?.username;
          return (
            <Pressable key={entry.username} accessibilityRole="link" accessibilityLabel={t('chat.openProfile', { name: entry.fullName })}
              onPress={() => openProfile(entry.username)}
              style={({ pressed }) => [styles.rank, index > 0 && styles.separator, me && styles.me, pressed && { opacity: 0.75 }]}>
              <Text style={[styles.position, index < 3 && { color: colors.amber }]}>{index + 1}</Text>
              <View style={{ flex: 1 }}>
                <AppText style={{ fontWeight: '700' }}>{me ? t('leaderboard.you', { name: entry.fullName }) : entry.fullName}</AppText>
                <AppText variant="small">@{entry.username} · {tp('plural.points', entry.points)}</AppText>
              </View>
              <AppText style={{ color: colors.amber, fontWeight: '800' }}>🔥 {tp('plural.days', entry.streak)}</AppText>
            </Pressable>
          );
        })}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  chatRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
  },
  chatRowUnread: { borderColor: `${colors.cyan}88` },
  chatIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  chatTitle: { color: colors.text, fontWeight: '800', fontSize: 15.5, flexShrink: 1 },
  chatTime: { color: colors.faint, fontSize: 12 },
  chatPreview: { color: colors.muted, fontSize: 13.5, flex: 1 },
  chatMeta: { color: colors.faint, fontSize: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.cyan },
  separator: { borderTopWidth: 1, borderTopColor: colors.border },
  rank: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 4 },
  me: { backgroundColor: `${colors.indigo}22`, borderRadius: 10 },
  position: { width: 28, color: colors.muted, fontWeight: '900', fontSize: 16 },
});
