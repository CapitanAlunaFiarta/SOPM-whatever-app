import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { compareVersions, isNewerRelease, startUpdate, updateKind } from '@/lib/appVersion';
import { confirmAction, showMessage } from '@/lib/dialogs';
import { useJoinActivity, useLatestRelease } from '@/lib/queries';
import type { ActivityPayload, ActivityPreview, ChatMessage } from '@/lib/types';

import { CATEGORY_ICONS, isCategory } from './categories';
import { openProfile } from './JoinRequests';
import { colors, radius } from './theme';
import { AppText, Button, IconButton, Row } from './ui';

/** Textul scurt al unui mesaj din comunitate, pentru lista de chaturi. */
export function communityPreview(message: ChatMessage, t: ReturnType<typeof useI18n>['t']): string {
  const payload = message.payload ?? {};
  if (message.kind === 'STREAK') return t('chats.streakPreview', { name: message.senderName });
  if (message.kind === 'ACTIVITY' && payload.title) return t('chats.activityPreview', { title: payload.title });
  if (message.kind === 'UPDATE' && payload.version) return t('chats.updatePreview', { version: payload.version });
  return `${message.senderName}: ${message.text}`;
}

/** Un mesaj din chatul comunității: text, streak arătat, invitație la o activitate sau anunț de versiune. */
export function CommunityMessage({ message, preview, previewsLoading, canDelete, onDelete }: {
  message: ChatMessage;
  preview?: ActivityPreview;
  previewsLoading?: boolean;
  canDelete?: boolean;
  onDelete?: () => void;
}) {
  const { t, formatTime } = useI18n();
  const system = message.senderRole === 'SYSTEM';
  return (
    <View style={styles.message}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Pressable disabled={system} accessibilityRole={system ? undefined : 'link'}
          accessibilityLabel={system ? message.senderName : t('chat.openProfile', { name: message.senderName })}
          onPress={() => openProfile(message.senderUsername)} style={{ flexShrink: 1 }}>
          <Text style={[styles.sender, system && { color: colors.red }]} numberOfLines={1}>
            {message.senderName}{' '}
            {system ? null : <Text style={styles.handle}>@{message.senderUsername}</Text>}
            {message.senderRole === 'ADMIN' ? <Text style={styles.admin}>  {t('chat.admin')}</Text> : null}
          </Text>
        </Pressable>
        <Row gap={4}>
          <AppText variant="small">{formatTime(message.createdAt)}</AppText>
          {canDelete && onDelete ? (
            <IconButton icon="trash-outline" label={t('chat.deleteLabel')} tone="danger" onPress={onDelete} />
          ) : null}
        </Row>
      </Row>
      {message.kind === 'STREAK' ? <StreakBody message={message} />
        : message.kind === 'ACTIVITY' && message.payload?.taskId ? (
          <ActivityInviteCard payload={message.payload as ActivityPayload} preview={preview} loading={previewsLoading}
            ownerName={message.senderName} />
        ) : message.kind === 'UPDATE' && message.payload?.version ? (
          <UpdateBody version={message.payload.version} build={Number(message.payload.build ?? 0)} url={message.payload.url} />
        ) : <AppText>{message.text}</AppText>}
    </View>
  );
}

/**
 * Anunțul roșu al botului „Whatever”: versiune nouă, cu butonul de actualizare dacă nu o ai deja.
 * Butonul instalează mereu cea mai nouă versiune (un anunț mai vechi nu trimite la un APK depășit).
 */
function UpdateBody({ version, build, url }: { version: string; build: number; url?: string }) {
  const { t } = useI18n();
  const latest = useLatestRelease().data;
  const newest = latest?.version && (compareVersions(latest.version, version) > 0
    || (compareVersions(latest.version, version) === 0 && (latest.build ?? 0) > build))
    ? { version: latest.version, build: latest.build ?? 0, url: latest.url ?? url } : { version, build, url };
  const newer = isNewerRelease(newest);
  return (
    <View style={styles.update}>
      <Row gap={10}>
        <Ionicons name="alert-circle" size={22} color={colors.red} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.updateText}>{t('update.chatTitle', { version })}</Text>
          {build > 0 ? <AppText variant="small">{t('update.chatBuild', { build })}</AppText> : null}
        </View>
      </Row>
      {newest.version !== version ? <AppText variant="small">{t('update.newestIs', { version: newest.version })}</AppText> : null}
      {!newer ? <AppText variant="small">{t('update.chatHave')}</AppText>
        : updateKind === 'none' ? <AppText variant="small">{t('update.iosHint')}</AppText> : (
          <Button compact variant="danger" icon={updateKind === 'download' ? 'download-outline' : 'refresh'} title={t('update.update')}
            onPress={() => { startUpdate(newest.url).catch((error) => showMessage(t('card.actionFailed'), errorMessage(error))); }} />
        )}
    </View>
  );
}

function StreakBody({ message }: { message: ChatMessage }) {
  const { t, tp } = useI18n();
  const streak = Number(message.payload?.streak ?? 0);
  const points = Number(message.payload?.points ?? 0);
  return (
    <View style={styles.streak}>
      <Text style={styles.streakNumber}>🔥 {streak}</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.streakTitle}>
          {t('streakCard.title', { name: message.senderName.split(' ')[0], days: tp('plural.days', streak) })}
        </Text>
        <AppText variant="small">{t('streakCard.points', { points: tp('plural.points', points) })}</AppText>
      </View>
    </View>
  );
}

/** Invitația la o activitate de grup: oricine poate cere să participe, organizatorul aprobă. */
function ActivityInviteCard({ payload, preview, loading, ownerName }: {
  payload: ActivityPayload; preview?: ActivityPreview; loading?: boolean; ownerName: string;
}) {
  const { t, formatDate } = useI18n();
  const join = useJoinActivity();
  const category = isCategory(payload.category) ? payload.category : 'CHORES';

  const ask = async (cancel = false) => {
    try {
      const result = await join.mutateAsync({ id: payload.taskId, cancel });
      // O invitație primită direct de la organizator se acceptă pe loc: deschidem chatul activității.
      if (!cancel && result.myStatus === 'MEMBER') router.push(`/chat/${payload.taskId}`);
    } catch (error) {
      showMessage(t('card.actionFailed'), errorMessage(error));
    }
  };

  let state: ReactNode;
  if (!preview) {
    state = loading ? <AppText variant="small">{t('common.loading')}</AppText>
      : <AppText variant="small">{t('activityCard.unavailable')}</AppText>;
  } else if (preview.myStatus === 'OWNER') {
    state = <AppText variant="small">{t('activityCard.yours')}</AppText>;
  } else if (preview.myStatus === 'MEMBER') {
    state = (
      <Row style={{ flexWrap: 'wrap' }}>
        <AppText variant="small" style={{ color: colors.green }}>{t('activityCard.member')}</AppText>
        <Button compact variant="secondary" icon="chatbubbles-outline" title={t('activityCard.openChat')}
          onPress={() => router.push(`/chat/${preview.id}`)} />
      </Row>
    );
  } else if (preview.myStatus === 'REQUESTED') {
    state = (
      <Row style={{ flexWrap: 'wrap' }}>
        <AppText variant="small" style={{ color: colors.cyan }}>{t('activityCard.requested')}</AppText>
        <Button compact variant="ghost" title={t('activityCard.withdraw')} loading={join.isPending} onPress={async () => {
          if (await confirmAction(t('activityCard.withdraw'), payload.title, t('activityCard.withdraw'))) await ask(true);
        }} />
      </Row>
    );
  } else if (preview.myStatus === 'DECLINED') {
    state = <AppText variant="small">{t('activityCard.declined')}</AppText>;
  } else if (preview.canJoin) {
    state = (
      <Button compact icon="hand-right-outline" loading={join.isPending}
        title={preview.myStatus === 'INVITED' ? t('activityCard.acceptInvite') : t('activityCard.join')}
        onPress={() => ask()} />
    );
  } else {
    state = <AppText variant="small">{preview.full ? t('activityCard.full') : t('activityCard.closed')}</AppText>;
  }

  return (
    <View style={styles.invite}>
      <Row gap={8}>
        <Ionicons name="megaphone-outline" size={15} color={colors.violet} />
        <Text style={styles.inviteLabel}>{t('activityCard.invite')}</Text>
      </Row>
      <Row gap={10}>
        <View style={styles.inviteIcon}>
          <Ionicons name={CATEGORY_ICONS[category] ?? 'ellipse-outline'} size={18} color={colors.cyan} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.inviteTitle} numberOfLines={2}>{payload.title}</Text>
          <AppText variant="small">
            {t(`categoryShort.${category}`)} · {formatDate(payload.dueDate)}
            {preview ? ` · ${t('activityCard.members', { count: preview.memberCount, max: preview.maxMembers })}` : ''}
          </AppText>
          <AppText variant="small">{t('activityCard.by', { name: preview?.ownerName ?? ownerName })}</AppText>
        </View>
      </Row>
      {state}
    </View>
  );
}

const styles = StyleSheet.create({
  message: { paddingVertical: 10, gap: 6 },
  sender: { color: colors.cyan, fontWeight: '800' },
  handle: { color: colors.faint, fontWeight: '500' },
  admin: { color: colors.violet, fontWeight: '800', fontSize: 12 },
  streak: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md,
    backgroundColor: `${colors.amber}14`, borderWidth: 1, borderColor: `${colors.amber}55`,
  },
  streakNumber: { color: colors.amber, fontSize: 24, fontWeight: '900' },
  streakTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  invite: {
    gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.elevated, borderWidth: 1, borderColor: `${colors.violet}55`,
  },
  inviteLabel: { color: colors.violet, fontWeight: '800', fontSize: 12.5 },
  inviteIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  inviteTitle: { color: colors.text, fontWeight: '800', fontSize: 15.5 },
  update: {
    gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: `${colors.red}1F`, borderWidth: 1, borderColor: `${colors.red}AA`,
  },
  updateText: { color: colors.red, fontWeight: '900', fontSize: 15.5 },
});
