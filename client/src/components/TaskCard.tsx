import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n, type PluralKey } from '@/i18n';
import { isMember, type RepeatUnit, type Task } from '@/lib/types';

import { CATEGORY_ICONS, isCategory } from './categories';
import { JoinRequests } from './JoinRequests';
import { TaskActions } from './TaskActions';
import { colors, radius, type Tone } from './theme';
import { Badge } from './ui';

const STATUS_TONES: Record<Task['status'], Tone> = {
  Upcoming: 'info',
  Overdue: 'warning',
  Completed: 'success',
  Canceled: 'neutral',
};

/** „Zilnic”, „La fiecare 3 zile”, „Săptămânal”, „La fiecare 2 săptămâni”. */
export function repeatLabel(tp: (key: PluralKey, count: number) => string, every = 1, unit: RepeatUnit = 'DAY'): string {
  return tp(unit === 'WEEK' ? 'plural.everyWeeks' : 'plural.everyDays', Math.max(1, every));
}

/** Deschide ecranul cu detaliile activității (descriere, hartă, membri, Google Maps și Calendar). */
export function openActivity(id: number) {
  router.push(`/activity/${id}`);
}

export function TaskCard({ task, compact }: { task: Task; compact?: boolean }) {
  const { t, tp, formatDate } = useI18n();
  const active = task.status === 'Upcoming' || task.status === 'Overdue';
  const member = isMember(task);
  const invited = task.myStatus === 'INVITED';
  const people = (task.participants ?? []).filter((person) => person.status !== 'DECLINED');
  // Activitate unică de grup: mi-am făcut partea, dar nu au confirmat încă toți.
  const waiting = member && active && task.confirmedByMe && !task.isRecurring && people.length > 0;

  return (
    <View style={[styles.card, task.status === 'Overdue' && { borderColor: `${colors.amber}88` }]}>
      {/* Partea de sus deschide detaliile; butoanele de dedesubt rămân separate (nu un buton în alt buton). */}
      <Pressable accessibilityRole="link" accessibilityLabel={t('details.open', { title: task.title })}
        onPress={() => openActivity(task.id)} style={({ pressed }) => [{ gap: 10 }, pressed && { opacity: 0.75 }]}>
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
          <Ionicons name="chevron-forward" size={16} color={colors.faint} />
        </View>

        {!compact && (
          <View style={styles.tags}>
            {task.isRecurring && (
              <Badge icon="repeat" tone="accent"
                text={t('card.repeat', { label: repeatLabel(tp, task.repeatEvery, task.repeatUnit), count: task.streakCount })} />
            )}
            {task.requiresLocation && <Badge text={t('card.gps', { radius: task.radius })} icon="location-outline" tone="info" />}
            {task.requiresBiometrics && <Badge text={t('bio.generic')} icon="finger-print" tone="accent" />}
            {task.description ? <Badge text={t('card.hasDescription')} icon="document-text-outline" /> : null}
            {!task.isOwner && !invited && <Badge text={t('card.from', { username: task.ownerUsername })} icon="people-outline" />}
            {task.shared && (
              <Badge icon="megaphone-outline" tone="accent"
                text={`${t('card.public')} · ${t('activityCard.members', { count: task.memberCount, max: task.maxMembers ?? 30 })}`} />
            )}
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
      </Pressable>
      {invited && <Text style={styles.invite}>{t('group.inviteFrom', { username: task.ownerUsername })}</Text>}
      {task.isOwner && !compact ? <JoinRequests task={task} /> : null}
      {waiting && !compact && <Text style={styles.meta}>{t('group.waiting')}</Text>}
      {member && active && task.nextOn ? (
        <Text style={styles.meta}>{t('card.nextOn', { date: formatDate(task.nextOn, { absolute: true }) })}</Text>
      ) : null}
      <TaskActions task={task} compact={compact} />
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
});
