import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ActivityHeatmap } from '@/components/ActivityHeatmap';
import { CATEGORY_ICONS } from '@/components/categories';
import { colors } from '@/components/theme';
import { AppText, Banner, Card, EmptyState, IconButton, Loading, Row, Screen } from '@/components/ui';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { monthKey, shiftMonth } from '@/lib/dates';
import { useAuth } from '@/lib/auth';
import { useRecap } from '@/lib/queries';
import { CATEGORIES } from '@/lib/types';

/**
 * Recap lunar: câte activități ai finalizat în fiecare categorie. Bare orizontale ordonate descrescător,
 * într-o singură culoare (lungimea compară valorile); fiecare rând are numele, numărul și procentul.
 */
export default function RecapScreen() {
  const { t, tp, formatMonth } = useI18n();
  const thisMonth = monthKey();
  const [month, setMonth] = useState(thisMonth);
  const recap = useRecap(month);
  const { user } = useAuth();
  const data = recap.data?.month === month ? recap.data : undefined;

  const rows = data
    ? [...data.categories].sort((a, b) => b.count - a.count || CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category))
    : [];
  const largest = Math.max(1, ...rows.map((row) => row.count));
  const delta = data ? data.total - data.previousTotal : 0;

  return (
    <Screen refreshing={recap.isRefetching} onRefresh={() => recap.refetch()}>
      <Row style={{ justifyContent: 'space-between' }}>
        <IconButton icon="chevron-back" label={t('recap.previous')} onPress={() => setMonth(shiftMonth(month, -1))} />
        <AppText variant="heading">{formatMonth(month)}</AppText>
        {month < thisMonth
          ? <IconButton icon="chevron-forward" label={t('recap.next')} onPress={() => setMonth(shiftMonth(month, 1))} />
          : <View style={styles.placeholder} />}
      </Row>
      <AppText variant="muted" style={{ textAlign: 'center' }}>{t('recap.subtitle')}</AppText>
      {recap.error ? <Banner text={errorMessage(recap.error)} /> : null}

      {!data ? (recap.error ? null : <View style={{ height: 220 }}><Loading /></View>) : (
        <>
          <Card style={{ alignItems: 'center', gap: 2 }}>
            <Text style={styles.hero}>{data.total}</Text>
            <AppText variant="muted">{tp('plural.completed', data.total)}</AppText>
            <Row gap={6} style={{ marginTop: 6 }}>
              <Ionicons size={15} name={delta > 0 ? 'trending-up' : delta < 0 ? 'trending-down' : 'remove'}
                color={delta > 0 ? colors.green : delta < 0 ? colors.amber : colors.muted} />
              <AppText variant="small">
                {delta > 0 ? t('recap.more', { count: delta }) : delta < 0 ? t('recap.less', { count: -delta }) : t('recap.same')}
              </AppText>
            </Row>
          </Card>

          {data.total === 0 ? (
            <Card><EmptyState icon="stats-chart-outline" title={t('recap.emptyTitle')} text={t('recap.emptyText')} /></Card>
          ) : (
            <Card style={{ gap: 16 }}>
              {rows.map((row) => {
                const label = t(`category.${row.category}`);
                const share = Math.round((row.count / data.total) * 100);
                return (
                  <View key={row.category} style={{ gap: 7 }} accessible
                    accessibilityLabel={`${label}: ${tp('plural.activities', row.count)}, ${share}%`}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Row gap={8} style={{ flex: 1 }}>
                        <Ionicons name={CATEGORY_ICONS[row.category]} size={17} color={colors.muted} />
                        <AppText style={{ flexShrink: 1, fontWeight: '600' }}>{label}</AppText>
                      </Row>
                      <Text style={styles.figure}>
                        {row.count}
                        <Text style={styles.share}>  {share}%</Text>
                      </Text>
                    </Row>
                    <View style={styles.lane}>
                      {row.count > 0 ? <View style={[styles.bar, { width: `${(row.count / largest) * 100}%` }]} /> : null}
                    </View>
                  </View>
                );
              })}
            </Card>
          )}
        </>
      )}
      <ActivityHeatmap bestStreak={user?.bestStreak} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  placeholder: { width: 30 },
  hero: { color: colors.text, fontSize: 52, fontWeight: '800' },
  figure: { color: colors.text, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  share: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  lane: { height: 10 },
  // Capătul de date rotunjit (4px), capătul de la bază drept.
  bar: { height: 10, backgroundColor: colors.cyan, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
});
