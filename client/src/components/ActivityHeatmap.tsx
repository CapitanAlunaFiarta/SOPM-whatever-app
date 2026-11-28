import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useActivityDays } from '@/lib/queries';
import { shortMonthLabel } from '@/lib/dates';

import { colors } from './theme';
import { AppText, Banner, Card, Row } from './ui';

/**
 * Trepte de culoare pentru numărul de activități dintr-o zi: o singură nuanță (albastrul aplicației), tot mai
 * deschisă pe fundalul închis. Culori pline (amestecul albastrului cu fundalul cardului), ca treptele să arate
 * la fel peste orice. 0 = nicio activitate.
 */
const LEVELS = [colors.elevated, '#19405e', '#236a91', '#2e94c4', colors.cyan] as const;
const GAP = 3;
const MIN_CELL = 13;

export function levelOf(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  return count <= 4 ? 3 : 4;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}

/**
 * Harta zilelor active (ca pe GitHub): o coloană pe săptămână, de luni până duminică; cu cât mai multe activități
 * finalizate într-o zi, cu atât pătratul e mai deschis. Încap atâtea săptămâni câte permite lățimea ecranului.
 * Apăsarea (sau trecerea cu mouse-ul) pe o zi arată data și numărul.
 */
export function ActivityHeatmap({ bestStreak }: { bestStreak?: number }) {
  const { t, tp, formatDate, language } = useI18n();
  const activity = useActivityDays(26);
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const data = activity.data;

  const counts = useMemo(() => new Map((data?.days ?? []).map((day) => [day.date, day.count])), [data]);
  const weeks = useMemo(() => {
    if (!data) return [] as (string | null)[][];
    return Array.from({ length: data.weeks }, (_, week) => Array.from({ length: 7 }, (__, day) => {
      const date = addDays(data.from, week * 7 + day);
      return date > data.to ? null : date;
    }));
  }, [data]);
  const columns = width > 0 ? Math.max(8, Math.min(weeks.length, Math.floor((width + GAP) / (MIN_CELL + GAP)))) : 0;
  const cell = columns > 0 ? Math.floor((width - (columns - 1) * GAP) / columns) : 0;
  const shown = weeks.slice(-columns);
  const selectedCount = selected ? counts.get(selected) ?? 0 : 0;
  const weekdays = t('calendar.weekdays').split(',');

  return (
    <Card>
      <Row gap={8}>
        <Ionicons name="grid-outline" size={17} color={colors.cyan} />
        <AppText variant="heading">{t('heatmap.title')}</AppText>
      </Row>
      {activity.error ? <Banner text={errorMessage(activity.error)} /> : null}
      {data ? (
        <AppText variant="muted">
          {tp('plural.activeDays', data.activeDays)}{' · '}{tp('plural.lastWeeks', shown.length || data.weeks)}
          {bestStreak ? ` · ${t('heatmap.best', { days: tp('plural.days', bestStreak) })}` : ''}
        </AppText>
      ) : <AppText variant="muted">{t('common.loading')}</AppText>}
      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ gap: 4 }}
        accessibilityLabel={data ? t('heatmap.summary', { days: data.activeDays, total: data.total }) : undefined}>
        {cell > 0 ? (
          <>
            <View style={[styles.row, { gap: GAP, height: 14 }]}>
              {shown.map((week, index) => {
                // Eticheta lunii stă deasupra săptămânii în care începe luna; prima coloană o primește doar dacă
                // următoarea lună nu începe imediat (altfel etichetele s-ar suprapune).
                const startsMonth = (column?: (string | null)[]) => column?.some((day) => day !== null && day.endsWith('-01')) ?? false;
                const first = week.find((day) => day !== null && day.endsWith('-01'));
                const label = first ?? (index === 0 && !startsMonth(shown[1]) && !startsMonth(shown[2]) ? week[0] : null);
                return (
                  <View key={`m-${index}`} style={{ width: cell, height: 14 }}>
                    {label ? <Text style={styles.month}>{shortMonthLabel(label.slice(0, 7), language)}</Text> : null}
                  </View>
                );
              })}
            </View>
            {Array.from({ length: 7 }, (_, day) => (
              <View key={`d-${day}`} style={[styles.row, { gap: GAP }]}>
                {shown.map((week, index) => {
                  const date = week[day];
                  if (!date) return <View key={`e-${index}`} style={{ width: cell, height: cell }} />;
                  const count = counts.get(date) ?? 0;
                  return (
                    <Pressable key={date} onPress={() => setSelected(date)} onHoverIn={() => setSelected(date)}
                      accessibilityRole="button" accessibilityLabel={t('heatmap.day', { date: formatDate(date, { absolute: true }), count })}
                      style={[styles.cell, { width: cell, height: cell, backgroundColor: LEVELS[levelOf(count)] },
                        selected === date && styles.selected]} />
                  );
                })}
              </View>
            ))}
          </>
        ) : null}
      </View>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <AppText variant="small">
          {selected ? `${formatDate(selected, { absolute: true })} (${weekdays[(new Date(`${selected}T12:00:00Z`).getUTCDay() + 6) % 7]}): ${tp('plural.activities', selectedCount)}`
            : t('heatmap.hint')}
        </AppText>
        <Row gap={4}>
          <AppText variant="small">{t('heatmap.less')}</AppText>
          {LEVELS.map((color) => <View key={color} style={[styles.legend, { backgroundColor: color }]} />)}
          <AppText variant="small">{t('heatmap.more')}</AppText>
        </Row>
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  cell: { borderRadius: 3 },
  selected: { borderWidth: 1.5, borderColor: colors.text },
  // Eticheta e mai lată decât o coloană: se întinde peste coloanele următoare (goale).
  month: { position: 'absolute', left: 0, top: 0, width: 44, color: colors.faint, fontSize: 10.5, fontWeight: '700' },
  legend: { width: 11, height: 11, borderRadius: 2 },
});
