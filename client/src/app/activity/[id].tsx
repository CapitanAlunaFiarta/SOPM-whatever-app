import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useMemo } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { CATEGORY_ICONS, isCategory } from '@/components/categories';
import { ActivityJoinState } from '@/components/CommunityMessage';
import { JoinRequests, openProfile } from '@/components/JoinRequests';
import { TaskActions } from '@/components/TaskActions';
import { repeatLabel } from '@/components/TaskCard';
import { TasksMap } from '@/components/TasksMap';
import { colors, radius, type Tone } from '@/components/theme';
import { AppText, Badge, Button, Card, EmptyState, type IconName, Loading, Row, Screen } from '@/components/ui';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { googleCalendarUrl, googleMapsUrl } from '@/lib/calendar';
import { showMessage } from '@/lib/dialogs';
import { useActivityPreviews, useTasks } from '@/lib/queries';
import { isMember, type ActivityPreview, type Task, type TaskStatus } from '@/lib/types';

const STATUS_TONES: Record<TaskStatus, Tone> = { Upcoming: 'info', Overdue: 'warning', Completed: 'success', Canceled: 'neutral' };

function open(url: string, failure: string) {
  Linking.openURL(url).catch((error) => showMessage(failure, errorMessage(error)));
}

/**
 * Detaliile unei activități: descrierea completă, când revine, harta cu raza și butonul spre Google Maps,
 * membrii și chatul, adăugarea în Google Calendar și toate acțiunile de pe card. O activitate din comunitate
 * la care nu sunt membru se vede fără locație (o vede doar cine a fost primit).
 */
export default function ActivityScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const taskId = Number(id);
  const tasks = useTasks();
  const task = tasks.data?.find((item) => item.id === taskId);
  const previews = useActivityPreviews(tasks.data && !task && Number.isInteger(taskId) ? [taskId] : []);
  const preview = previews.data?.find((item) => item.id === taskId);

  if (tasks.isLoading || (!task && previews.isLoading)) return <Loading />;
  if (task) return <TaskDetails task={task} />;
  if (preview) return <PreviewDetails preview={preview} />;
  return (
    <Screen>
      <Card><EmptyState icon="help-circle-outline" title={t('task.notFoundTitle')} text={t('details.notFound')} /></Card>
    </Screen>
  );
}

function Section({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <Card>
      <Row gap={8}>
        <Ionicons name={icon} size={17} color={colors.cyan} />
        <AppText variant="heading">{title}</AppText>
      </Row>
      {children}
    </Card>
  );
}

function Header({ title, category, status, ownerName, ownerUsername, isOwner, badges }: {
  title: string; category: string; status: TaskStatus; ownerName: string; ownerUsername: string; isOwner: boolean;
  badges: ReactNode;
}) {
  const { t } = useI18n();
  const key = isCategory(category) ? category : 'CHORES';
  return (
    <Card>
      <Row gap={12}>
        <View style={styles.icon}>
          <Ionicons name={CATEGORY_ICONS[key] ?? 'ellipse-outline'} size={22} color={colors.cyan} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.title, status === 'Completed' && styles.done]} selectable>{title}</Text>
          <AppText variant="muted">{t(`category.${key}`)}</AppText>
        </View>
        <Badge text={t(`status.${status}`)} tone={STATUS_TONES[status]} />
      </Row>
      <Row style={{ flexWrap: 'wrap' }} gap={6}>{badges}</Row>
      {!isOwner && (
        <Pressable accessibilityRole="link" accessibilityLabel={t('chat.openProfile', { name: ownerName })}
          onPress={() => openProfile(ownerUsername)}>
          <AppText variant="small">{t('details.organizer')} <Text style={styles.link}>{ownerName} @{ownerUsername}</Text></AppText>
        </Pressable>
      )}
    </Card>
  );
}

function Description({ text, editable, taskId }: { text: string; editable?: boolean; taskId?: number }) {
  const { t } = useI18n();
  return (
    <Section icon="document-text-outline" title={t('details.description')}>
      {text ? <Text style={styles.description} selectable>{text}</Text> : (
        <>
          <AppText variant="muted">{t('details.noDescription')}</AppText>
          {editable && taskId ? (
            <Button compact variant="secondary" icon="create-outline" title={t('details.addDescription')}
              onPress={() => router.push(`/task/${taskId}`)} style={{ alignSelf: 'flex-start' }} />
          ) : null}
        </>
      )}
    </Section>
  );
}

function TaskDetails({ task }: { task: Task }) {
  const { t, tp, formatDate } = useI18n();
  const active = task.status === 'Upcoming' || task.status === 'Overdue';
  const people = (task.participants ?? []).filter((person) => person.status !== 'DECLINED');
  // Harta se reface doar când se schimbă locul sau raza, nu la fiecare reîmprospătare a listei.
  const mapTasks = useMemo(() => [task], [task.id, task.latitude, task.longitude, task.radius, task.status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Screen>
      <Stack.Screen options={{ title: task.title }} />
      <Header title={task.title} category={task.category} status={task.status} ownerName={task.ownerName}
        ownerUsername={task.ownerUsername} isOwner={task.isOwner} badges={(
          <>
            <Badge text={t(`priority.${task.priority}`)} icon="flag-outline" />
            {task.requiresLocation ? <Badge text={t('card.gps', { radius: task.radius })} icon="location-outline" tone="info" /> : null}
            {task.requiresBiometrics ? <Badge text={t('bio.generic')} icon="finger-print" tone="accent" /> : null}
            {task.shared ? <Badge text={t('card.public')} icon="megaphone-outline" tone="accent" /> : null}
            {task.completedToday ? <Badge text={t('card.doneToday')} icon="checkmark" tone="success" /> : null}
          </>
        )} />

      <Section icon="calendar-outline" title={t('details.when')}>
        <AppText>
          {task.nextOn ? t('card.nextOn', { date: formatDate(task.nextOn, { absolute: true }) })
            : t('details.due', { date: formatDate(task.dueDate, { inline: true }) })}
        </AppText>
        {task.isRecurring ? (
          <AppText variant="muted">
            {t('details.repeats', { label: repeatLabel(tp, task.repeatEvery, task.repeatUnit) })}
            {' · '}{task.streakCount > 0 ? tp('plural.timesDone', task.streakCount) : t('details.notDoneYet')}
          </AppText>
        ) : null}
        {task.lastCompletedOn ? (
          <AppText variant="small">{t('details.lastDone', { date: formatDate(task.lastCompletedOn, { inline: true }) })}</AppText>
        ) : null}
        <Button compact variant="secondary" icon="calendar-number-outline" title={t('details.googleCalendar')}
          style={{ alignSelf: 'flex-start' }}
          onPress={() => open(googleCalendarUrl(task, t('details.openInWhatever')), t('card.actionFailed'))} />
      </Section>

      <Description text={task.description ?? ''} editable={task.isOwner && active} taskId={task.id} />

      {task.requiresLocation ? (
        <Section icon="location-outline" title={t('details.location')}>
          <View style={{ height: 220 }}>
            <TasksMap tasks={mapTasks} center={task} minHeight={220} preview />
          </View>
          <AppText variant="small">
            {t('details.radius', { radius: task.radius })} · {task.latitude.toFixed(5)}, {task.longitude.toFixed(5)}
          </AppText>
          <Button icon="navigate" title={t('details.googleMaps')}
            onPress={() => open(googleMapsUrl(task.latitude, task.longitude), t('card.actionFailed'))} />
        </Section>
      ) : null}

      {people.length > 0 || task.shared ? (
        <Section icon="people-outline" title={t('details.members', { count: task.memberCount, max: task.maxMembers ?? 30 })}>
          <Person name={task.ownerName} username={task.ownerUsername} avatar={task.ownerAvatarVersion}
            note={t('details.organizerShort')} />
          {people.map((person) => (
            <Person key={person.username} name={person.fullName} username={person.username} avatar={person.avatarVersion}
              note={person.status === 'INVITED' ? t('details.invitedShort')
                : person.confirmed ? t('details.confirmedShort') : t('details.memberShort')}
              confirmed={person.confirmed} />
          ))}
          {task.chat?.available ? (
            <Button compact variant="secondary" icon="chatbubbles-outline" style={{ alignSelf: 'flex-start' }}
              title={task.chat.messageCount > 0 ? t('group.chatCount', { count: task.chat.messageCount }) : t('group.chat')}
              onPress={() => router.push(`/chat/${task.id}`)} />
          ) : null}
          {task.isOwner ? <JoinRequests task={task} /> : null}
        </Section>
      ) : null}

      {isMember(task) || task.myStatus === 'INVITED' ? (
        <Section icon="flash-outline" title={t('details.actions')}>
          {task.myStatus === 'INVITED' ? <AppText variant="muted">{t('group.inviteFrom', { username: task.ownerUsername })}</AppText> : null}
          <TaskActions task={task} onDeleted={() => (router.canGoBack() ? router.back() : router.replace('/tasks'))} />
          {!task.isOwner && !active ? <AppText variant="small">{t('details.finished')}</AppText> : null}
        </Section>
      ) : null}
    </Screen>
  );
}

function Person({ name, username, note, confirmed, avatar }: {
  name: string; username: string; note: string; confirmed?: boolean; avatar?: number | null;
}) {
  const { t } = useI18n();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={t('chat.openProfile', { name })} onPress={() => openProfile(username)}
      style={({ pressed }) => [styles.person, pressed && { opacity: 0.7 }]}>
      <Avatar username={username} name={name} version={avatar} size={32} />
      <View style={{ flex: 1 }}>
        <Text style={styles.personName} numberOfLines={1}>{name}</Text>
        <Text style={styles.handle} numberOfLines={1}>@{username}</Text>
      </View>
      <Text style={[styles.note, confirmed && { color: colors.green }]}>{note}</Text>
    </Pressable>
  );
}

/** O activitate din comunitate la care nu sunt (încă) membru: fără locație și fără lista membrilor. */
function PreviewDetails({ preview }: { preview: ActivityPreview }) {
  const { t, tp, formatDate } = useI18n();
  return (
    <Screen>
      <Stack.Screen options={{ title: preview.title }} />
      <Header title={preview.title} category={preview.category} status={preview.status} ownerName={preview.ownerName}
        ownerUsername={preview.ownerUsername} isOwner={preview.myStatus === 'OWNER'} badges={(
          <>
            {preview.priority ? <Badge text={t(`priority.${preview.priority}`)} icon="flag-outline" /> : null}
            <Badge text={t('card.public')} icon="megaphone-outline" tone="accent" />
            <Badge text={t('activityCard.members', { count: preview.memberCount, max: preview.maxMembers })} icon="people-outline" />
          </>
        )} />
      <Section icon="calendar-outline" title={t('details.when')}>
        <AppText>{t('details.due', { date: formatDate(preview.dueDate, { inline: true }) })}</AppText>
        {preview.isRecurring ? (
          <AppText variant="muted">{t('details.repeats', { label: repeatLabel(tp, preview.repeatEvery, preview.repeatUnit) })}</AppText>
        ) : null}
      </Section>
      <Description text={preview.description ?? ''} />
      {preview.requiresLocation ? (
        <Section icon="location-outline" title={t('details.location')}>
          <AppText variant="muted">{t('details.locationHidden')}</AppText>
        </Section>
      ) : null}
      <Section icon="hand-right-outline" title={t('details.join')}>
        <ActivityJoinState preview={preview} title={preview.title} />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.elevated, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 19, fontWeight: '800' },
  done: { color: colors.muted, textDecorationLine: 'line-through' },
  description: { color: colors.text, fontSize: 15.5, lineHeight: 23 },
  link: { color: colors.cyan, fontWeight: '700' },
  person: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10,
    borderRadius: radius.md, backgroundColor: colors.elevated,
  },
  personName: { color: colors.text, fontWeight: '700' },
  handle: { color: colors.faint, fontSize: 12.5 },
  note: { color: colors.muted, fontSize: 12.5, fontWeight: '700' },
});
