import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '@/lib/api';
import { friendlyDate, pluralDays, pluralPoints } from '@/lib/dates';
import { confirmAction, showMessage } from '@/lib/dialogs';
import { useCompleteTask, useTaskAction } from '@/lib/queries';
import { PRIORITY_LABELS, STATUS_LABELS, type Task } from '@/lib/types';

import { colors, radius, type Tone } from './theme';
import { Badge, Button, type IconName } from './ui';

const CATEGORY_ICONS: Record<string, IconName> = {
  Personal: 'person-outline',
  Facultate: 'school-outline',
  Sport: 'barbell-outline',
  'Proiect Echipă': 'people-outline',
  Sănătate: 'heart-outline',
};

const STATUS_TONES: Record<Task['status'], Tone> = {
  Upcoming: 'info',
  Overdue: 'warning',
  Completed: 'success',
  Canceled: 'neutral',
};

export function TaskCard({ task, compact }: { task: Task; compact?: boolean }) {
  const complete = useCompleteTask();
  const action = useTaskAction();
  const active = task.status === 'Upcoming' || task.status === 'Overdue';
  const canComplete = task.isOwner && active && !task.completedToday;

  const onComplete = async () => {
    try {
      const result = await complete.mutateAsync(task);
      showMessage('Gata!', `Streak: ${pluralDays(result.streak)} · ${pluralPoints(result.points)}`);
    } catch (error) {
      showMessage('Nu s-a putut confirma', errorMessage(error));
    }
  };

  const run = async (kind: 'cancel' | 'freeze' | 'delete') => {
    const questions = {
      cancel: ['Anulezi activitatea?', 'Nu o vei mai putea finaliza.', 'Anulează'],
      freeze: ['Folosești un freeze?', 'Activitatea se mută pe azi și streak-ul tău e protejat pentru o zi ratată.', 'Folosește'],
      delete: ['Ștergi activitatea?', 'Ștergerea este definitivă.', 'Șterge'],
    } as const;
    const [title, message, label] = questions[kind];
    if (!(await confirmAction(title, message, label))) return;
    try {
      await action.mutateAsync({ task, action: kind });
    } catch (error) {
      showMessage('Acțiunea nu a reușit', errorMessage(error));
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
            {task.category} · {friendlyDate(task.dueDate)} · {PRIORITY_LABELS[task.priority]}
          </Text>
        </View>
        <Badge text={task.completedToday ? 'Făcută azi' : STATUS_LABELS[task.status]}
          tone={task.completedToday ? 'success' : STATUS_TONES[task.status]} />
      </View>

      {!compact && (
        <View style={styles.tags}>
          {task.isRecurring && <Badge text={`Zilnic · ${task.streakCount}×`} icon="repeat" tone="accent" />}
          {task.requiresLocation && <Badge text={`GPS · ${task.radius} m`} icon="location-outline" tone="info" />}
          {task.requiresBiometrics && <Badge text="Biometrie" icon="finger-print" tone="accent" />}
          {!task.isOwner && <Badge text={`De la @${task.ownerUsername}`} icon="people-outline" />}
          {task.isOwner && task.friend ? <Badge text={`Cu @${task.friend}`} icon="people-outline" /> : null}
        </View>
      )}

      {task.isOwner && (canComplete || !compact) && (
        <View style={styles.actions}>
          {canComplete && (
            <Button compact title="Confirmă" icon="checkmark-circle" loading={complete.isPending} onPress={onComplete} />
          )}
          {task.status === 'Overdue' && !compact && (
            <Button compact variant="secondary" title="Freeze" icon="snow-outline" loading={action.isPending} onPress={() => run('freeze')} />
          )}
          {active && !compact && (
            <Button compact variant="secondary" title="Editează" icon="create-outline" onPress={() => router.push(`/task/${task.id}`)} />
          )}
          {active && !compact && (
            <Button compact variant="ghost" title="Anulează" onPress={() => run('cancel')} />
          )}
          {!compact && <Button compact variant="ghost" title="Șterge" icon="trash-outline" onPress={() => run('delete')} />}
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
