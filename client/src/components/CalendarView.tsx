import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { calendarFeedUrl, googleSubscribeUrl } from '@/lib/calendar';
import { localDate, monthKey, shiftMonth } from '@/lib/dates';
import { confirmAction, showMessage } from '@/lib/dialogs';
import { useCalendarLink, useCalendarMonth, useResetCalendarLink } from '@/lib/queries';
import { monthWeeks, occurrences } from '@/lib/recurrence';
import { shareText } from '@/lib/share';
import { isMember, type CalendarCompletion, type Task } from '@/lib/types';

import { CATEGORY_ICONS, isCategory } from './categories';
import { openActivity, TaskCard } from './TaskCard';
import { colors, radius } from './theme';
import { AppText, Banner, Button, Card, IconButton, Row } from './ui';

/**
 * Calendarul lunii: în fiecare zi, activitățile programate (punct albastru; cele recurente pe toate zilele în
 * care revin) și ce am finalizat (punct verde). Sub grilă, ziua aleasă; jos, abonarea din Google Calendar.
 */
export function CalendarView({ tasks }: { tasks: Task[] }) {
  const { t, tp, formatMonth, formatDate } = useI18n();
  const today = localDate();
  const [month, setMonth] = useState(monthKey());
  const [selected, setSelected] = useState(today);
  const done = useCalendarMonth(month);
  const weeks = useMemo(() => monthWeeks(month), [month]);
  const days = weeks.flat().filter((day): day is string => day !== null);
  const from = days[0];
  const to = days[days.length - 1];

  // Programate: activitățile active la care sunt membru, pe zilele în care sunt (sau revin).
  const scheduled = useMemo(() => {
    const byDay = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!isMember(task) || (task.status !== 'Upcoming' && task.status !== 'Overdue')) continue;
      for (const day of occurrences(task, from, to)) byDay.set(day, [...(byDay.get(day) ?? []), task]);
    }
    return byDay;
  }, [tasks, from, to]);
  const finished = useMemo(() => {
    const byDay = new Map<string, CalendarCompletion[]>();
    for (const item of done.data?.month === month ? done.data.completions : []) {
      byDay.set(item.date, [...(byDay.get(item.date) ?? []), item]);
    }
    return byDay;
  }, [done.data, month]);

  const weekdays = t('calendar.weekdays').split(',');
  const selectedTasks = scheduled.get(selected) ?? [];
  const selectedDone = finished.get(selected) ?? [];
  const inMonth = selected.startsWith(month);

  const changeMonth = (delta: number) => {
    const next = shiftMonth(month, delta);
    setMonth(next);
    setSelected(next === monthKey() ? today : `${next}-01`);
  };

  return (
    <View style={{ gap: 14 }}>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <IconButton icon="chevron-back" label={t('recap.previous')} onPress={() => changeMonth(-1)} />
          <AppText variant="heading">{formatMonth(month)}</AppText>
          <IconButton icon="chevron-forward" label={t('recap.next')} onPress={() => changeMonth(1)} />
        </Row>
        {done.error ? <Banner text={errorMessage(done.error)} /> : null}
        <View style={styles.week}>
          {weekdays.map((name) => <Text key={name} style={styles.weekday}>{name}</Text>)}
        </View>
        {weeks.map((week, index) => (
          <View key={index} style={styles.week}>
            {week.map((day, column) => {
              if (!day) return <View key={column} style={styles.cell} />;
              const planned = scheduled.get(day)?.length ?? 0;
              const completed = finished.get(day)?.length ?? 0;
              const isSelected = day === selected;
              return (
                <Pressable key={day} onPress={() => setSelected(day)} accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={t('calendar.dayLabel', { date: formatDate(day), planned, done: completed })}
                  style={[styles.cell, styles.day, day === today && styles.today, isSelected && styles.selected]}>
                  <Text style={[styles.dayNumber, day < today && !isSelected && { color: colors.muted }, isSelected && { color: '#fff' }]}>
                    {Number(day.slice(8))}
                  </Text>
                  <View style={styles.dots}>
                    {planned > 0 ? <View style={[styles.dot, { backgroundColor: day < today ? colors.amber : colors.cyan }]} /> : null}
                    {completed > 0 ? <View style={[styles.dot, { backgroundColor: colors.green }]} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
        <Row style={{ flexWrap: 'wrap' }} gap={14}>
          <Legend color={colors.cyan} text={t('calendar.legendPlanned')} />
          <Legend color={colors.amber} text={t('calendar.legendOverdue')} />
          <Legend color={colors.green} text={t('calendar.legendDone')} />
        </Row>
      </Card>

      {inMonth ? (
        <>
          <AppText variant="heading">{formatDate(selected)}</AppText>
          {selectedTasks.length === 0 && selectedDone.length === 0 ? (
            <AppText variant="muted">{t('calendar.emptyDay')}</AppText>
          ) : null}
          {selectedTasks.map((task) => <TaskCard key={`${task.id}-${selected}`} task={task} compact />)}
          {selectedDone.length > 0 ? (
            <Card>
              <AppText variant="label">{tp('plural.completedThatDay', selectedDone.length)}</AppText>
              {selectedDone.map((item, index) => <DoneItem key={`${item.kind}-${item.id}-${index}`} item={item} />)}
            </Card>
          ) : null}
        </>
      ) : null}

      <CalendarSubscribe />
    </View>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <Row gap={6}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <AppText variant="small">{text}</AppText>
    </Row>
  );
}

function DoneItem({ item }: { item: CalendarCompletion }) {
  const { t } = useI18n();
  const category = isCategory(item.category) ? item.category : 'CHORES';
  const title = item.title ?? t('calendar.deleted');
  const content = (
    <Row gap={10}>
      <Ionicons name={item.kind === 'FAVOR' ? 'hand-left-outline' : CATEGORY_ICONS[category]} size={16} color={colors.green} />
      <AppText style={{ flex: 1 }} numberOfLines={1}>{title}</AppText>
      <AppText variant="small">{item.kind === 'FAVOR' ? t('calendar.favor') : t(`categoryShort.${category}`)}</AppText>
    </Row>
  );
  if (item.kind !== 'TASK') return content;
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={t('details.open', { title })} onPress={() => openActivity(item.id)}>
      {content}
    </Pressable>
  );
}

/**
 * Abonarea din Google Calendar: un link secret către fișierul .ics cu activitățile mele (se creează la prima
 * deschidere a calendarului și se poate reseta). Butonul deschide linkul direct din apăsare, ca browserul să nu
 * blocheze fereastra nouă.
 */
function CalendarSubscribe() {
  const { t, language } = useI18n();
  const link = useCalendarLink(true);
  const reset = useResetCalendarLink();
  const url = link.data ? calendarFeedUrl(link.data.token, language) : null;

  const subscribe = () => {
    if (!url) return;
    Linking.openURL(googleSubscribeUrl(url)).catch((error) => showMessage(t('card.actionFailed'), errorMessage(error)));
  };

  const copy = async () => {
    if (!url) return;
    if ((await shareText(url).catch(() => 'dismissed')) === 'copied') showMessage(t('calendar.googleTitle'), t('calendar.copied'));
  };

  const renew = async () => {
    if (!(await confirmAction(t('calendar.resetTitle'), t('calendar.resetText'), t('calendar.reset')))) return;
    try {
      await reset.mutateAsync();
      showMessage(t('calendar.googleTitle'), t('calendar.resetDone'));
    } catch (error) {
      showMessage(t('card.actionFailed'), errorMessage(error));
    }
  };

  return (
    <Card>
      <Row gap={8}>
        <Ionicons name="logo-google" size={17} color={colors.cyan} />
        <AppText variant="heading">{t('calendar.googleTitle')}</AppText>
      </Row>
      <AppText variant="muted">{t('calendar.googleText')}</AppText>
      {Platform.OS !== 'web' ? <AppText variant="small">{t('calendar.googlePhone')}</AppText> : null}
      <Row style={{ flexWrap: 'wrap' }} gap={8}>
        <Button compact icon="add-circle-outline" title={t('calendar.subscribe')} loading={link.isLoading} disabled={!url}
          onPress={subscribe} />
        <Button compact variant="secondary" icon="link-outline" title={t('calendar.copyLink')} disabled={!url} onPress={copy} />
        <Button compact variant="ghost" icon="refresh" title={t('calendar.reset')} loading={reset.isPending} disabled={!url}
          onPress={renew} />
      </Row>
      <AppText variant="small">{t('calendar.secret')}</AppText>
      {link.data?.lastFetchedAt ? <AppText variant="small" style={{ color: colors.green }}>{t('calendar.synced')}</AppText> : null}
      {link.error ? <Banner text={errorMessage(link.error)} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  week: { flexDirection: 'row', gap: 4 },
  weekday: { flex: 1, textAlign: 'center', color: colors.faint, fontSize: 12, fontWeight: '700' },
  cell: { flex: 1, aspectRatio: 1, maxHeight: 64 },
  day: {
    alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: radius.sm, backgroundColor: colors.elevated,
    borderWidth: 1, borderColor: 'transparent',
  },
  today: { borderColor: colors.cyan },
  selected: { backgroundColor: colors.indigo, borderColor: colors.indigo },
  dayNumber: { color: colors.text, fontWeight: '700', fontSize: 14 },
  dots: { flexDirection: 'row', gap: 3, height: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
