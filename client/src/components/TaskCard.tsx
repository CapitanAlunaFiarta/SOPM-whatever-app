import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { confirmAction, showMessage } from '@/lib/dialogs';
import { focusAvailable } from '@/lib/focus';
import { useCompleteTask, useInviteResponse, useTaskAction } from '@/lib/queries';
import { isMember, type Task } from '@/lib/types';

import { CATEGORY_ICONS, isCategory } from './categories';
import { colors, radius, type Tone } from './theme';
import { Badge, Button } from './ui';

const STATUS_TONES: Record<Task['status'], Tone> = {
  Upcoming: 'info',
  Overdue: 'warning',
  Completed: 'success',
  Canceled: 'neutral',
};

export function TaskCard({ task, compact }: { task: Task; compact?: boolean }) {
  const { t, tp, formatDate } = useI18n();
  const complete = useCompleteTask();
  const action = useTaskAction();
  const invite = useInviteResponse();
  const active = task.status === 'Upcoming' || task.status === 'Overdue';
  const member = isMember(task);
  const invited = task.myStatus === 'INVITED';
  const people = (task.participants ?? []).filter((person) => person.status !== 'DECLINED');
  const canComplete = member && active && !task.confirmedByMe;
  // Activitate unică de grup: mi-am făcut partea, dar nu au confirmat încă toți.
  const waiting = member && active && task.confirmedByMe && !task.isRecurring && people.length > 0;

  const onComplete = async () => {
    try {
      const result = await complete.mutateAsync(task);
      showMessage(t('card.done'), t('card.result', {
        streak: tp('plural.days', result.streak), points: tp('plural.points', result.points),
      }));
    } catch (error) {
      showMessage(t('card.confirmFailed'), errorMessage(error));
    }
  };

  const respond = async (accept: boolean) => {
    if (!accept && !(await confirmAction(t('group.declineTitle'), t('group.declineText'), t('group.decline')))) return;
    try {
      await invite.mutateAsync({ task, accept });
      // După acceptare se deschide direct chatul activității.
      if (accept) router.push(`/chat/${task.id}`);
    } catch (error) {
      showMessage(t('card.actionFailed'), errorMessage(error));
    }
  };

  const run = async (kind: 'cancel' | 'freeze' | 'delete') => {
    const questions = {
      cancel: [t('card.cancelTitle'), t('card.cancelText'), t('card.cancelConfirm')],
      freeze: [t('card.freezeTitle'), t('card.freezeText'), t('card.freezeConfirm')],
      delete: [t('card.deleteTitle'), t('card.deleteText'), t('common.delete')],
    } as const;
    const [title, message, label] = questions[kind];
    if (!(await confirmAction(title, message, label))) return;
    try {
      await action.mutateAsync({ task, action: kind });
    } catch (error) {
      showMessage(t('card.actionFailed'), errorMessage(error));
    }
  };

  return (
    <View style={[styles.card, task.status === 'Overdue' && { borderColor: `${colors.amber}88` }]}>
      <View style={styles.top}>
        <View style={styles.icon}>
          <Ionicons name={CATEGORY_ICONS[task.category] ?? 'ellipse-outline'} size={18} color={colors.cyan} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.title, task.status === 'Completed' && styles.done]} numberOfLines={2}>{task.title}</Text>
          <Text style={styles.meta}>
            {isCategory(task.category) ? t(`categoryShort.${task.category}`) : task.category} · {formatDate(task.dueDate)} · {t(`priority.${task.priority}`)}
          </Text>
        </View>
        <Badge text={task.completedToday ? t('card.doneToday') : t(`status.${task.status}`)}
          tone={task.completedToday ? 'success' : STATUS_TONES[task.status]} />
      </View>

      {!compact && (
        <View style={styles.tags}>
          {task.isRecurring && <Badge text={t('card.daily', { count: task.streakCount })} icon="repeat" tone="accent" />}
          {task.requiresLocation && <Badge text={t('card.gps', { radius: task.radius })} icon="location-outline" tone="info" />}
          {task.requiresBiometrics && <Badge text={t('bio.generic')} icon="finger-print" tone="accent" />}
          {!task.isOwner && !invited && <Badge text={t('card.from', { username: task.ownerUsername })} icon="people-outline" />}
          {people.length > 0 && member && (
            <Badge text={t('group.confirmations', { done: task.confirmedCount, total: task.memberCount })} icon="people-outline"
              tone={task.confirmedCount === task.memberCount ? 'success' : 'neutral'} />
          )}
          {people.map((person) => (
            <Badge key={person.username} tone={person.confirmed ? 'success' : 'neutral'}
              text={person.status === 'INVITED' ? t('group.invited', { username: person.username })
                : `@${person.username}${person.confirmed ? ' ✓' : ''}`} />
          ))}
        </View>
      )}
      {invited && <Text style={styles.invite}>{t('group.inviteFrom', { username: task.ownerUsername })}</Text>}
      {waiting && !compact && <Text style={styles.meta}>{t('group.waiting')}</Text>}

      {invited && (
        <View style={styles.actions}>
          <Button compact title={t('group.accept')} icon="checkmark" loading={invite.isPending} onPress={() => respond(true)} />
          <Button compact variant="ghost" title={t('group.decline')} onPress={() => respond(false)} />
        </View>
      )}

      {member && (canComplete || !compact) && (
        <View style={styles.actions}>
          {canComplete && (
            <Button compact title={t('card.confirm')} icon="checkmark-circle" loading={complete.isPending} onPress={onComplete} />
          )}
          {focusAvailable && canComplete && !compact && (
            <Button compact variant="secondary" title={t('focus.button')} icon="leaf-outline" onPress={() => router.push(`/focus/${task.id}`)} />
          )}
          {task.chat?.available && !compact && (
            <Button compact variant="secondary" icon="chatbubbles-outline" onPress={() => router.push(`/chat/${task.id}`)}
              title={task.chat.messageCount > 0 ? t('group.chatCount', { count: task.chat.messageCount }) : t('group.chat')} />
          )}
          {task.isOwner && task.status === 'Overdue' && !compact && (
            <Button compact variant="secondary" title={t('card.freeze')} icon="snow-outline" loading={action.isPending} onPress={() => run('freeze')} />
          )}
          {task.isOwner && active && !compact && (
            <Button compact variant="secondary" title={t('card.edit')} icon="create-outline" onPress={() => router.push(`/task/${task.id}`)} />
          )}
          {task.isOwner && active && !compact && (
            <Button compact variant="ghost" title={t('card.cancel')} onPress={() => run('cancel')} />
          )}
          {task.isOwner && !compact && <Button compact variant="ghost" title={t('common.delete')} icon="trash-outline" onPress={() => run('delete')} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 14, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.elevated, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  done: { color: colors.muted, textDecorationLine: 'line-through' },
  meta: { color: colors.muted, fontSize: 13 },
  invite: { color: colors.cyan, fontSize: 13.5, fontWeight: '700' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
