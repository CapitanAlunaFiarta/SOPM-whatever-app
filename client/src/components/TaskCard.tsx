import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { confirmAction, showMessage } from '@/lib/dialogs';
import { useCompleteTask, useTaskAction } from '@/lib/queries';
import type { Task } from '@/lib/types';

import { CATEGORY_ICONS } from './categories';
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
  const active = task.status === 'Upcoming' || task.status === 'Overdue';
  const canComplete = task.isOwner && active && !task.completedToday;

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
            {t(`categoryShort.${task.category}`)} · {formatDate(task.dueDate)} · {t(`priority.${task.priority}`)}
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
          {!task.isOwner && <Badge text={t('card.from', { username: task.ownerUsername })} icon="people-outline" />}
          {task.isOwner && task.friend ? <Badge text={t('card.with', { username: task.friend })} icon="people-outline" /> : null}
        </View>
      )}

      {task.isOwner && (canComplete || !compact) && (
        <View style={styles.actions}>
          {canComplete && (
            <Button compact title={t('card.confirm')} icon="checkmark-circle" loading={complete.isPending} onPress={onComplete} />
          )}
          {task.status === 'Overdue' && !compact && (
            <Button compact variant="secondary" title={t('card.freeze')} icon="snow-outline" loading={action.isPending} onPress={() => run('freeze')} />
          )}
          {active && !compact && (
            <Button compact variant="secondary" title={t('card.edit')} icon="create-outline" onPress={() => router.push(`/task/${task.id}`)} />
          )}
          {active && !compact && (
            <Button compact variant="ghost" title={t('card.cancel')} onPress={() => run('cancel')} />
          )}
          {!compact && <Button compact variant="ghost" title={t('common.delete')} icon="trash-outline" onPress={() => run('delete')} />}
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
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
