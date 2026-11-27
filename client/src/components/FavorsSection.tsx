import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useFavors } from '@/lib/queries';
import { OPEN_FAVOR_STATUSES, type FavorBalance } from '@/lib/types';

import { FavorCard } from './FavorCard';
import { colors } from './theme';
import { AppText, Badge, Banner, Button, Card, EmptyState, Row } from './ui';

const BALANCE: Record<FavorBalance['balance'], { key: 'favor.balanceEven' | 'favor.balanceIOwe' | 'favor.balanceTheyOwe';
  tone: 'neutral' | 'warning' | 'success' }> = {
  EVEN: { key: 'favor.balanceEven', tone: 'neutral' },
  I_OWE: { key: 'favor.balanceIOwe', tone: 'warning' },
  THEY_OWE: { key: 'favor.balanceTheyOwe', tone: 'success' },
};

/** Favorurile: balanța cu fiecare prieten, ce am de făcut pentru alții, ce am cerut eu și istoricul. */
export function FavorsSection() {
  const { t } = useI18n();
  const favors = useFavors();
  const all = favors.data?.favors ?? [];
  const balances = favors.data?.balances ?? [];
  const open = all.filter((favor) => OPEN_FAVOR_STATUSES.includes(favor.status));
  const forOthers = open.filter((favor) => favor.role === 'DOER');
  const mine = open.filter((favor) => favor.role === 'REQUESTER');
  const history = all.filter((favor) => !OPEN_FAVOR_STATUSES.includes(favor.status)).slice(0, 10);

  return (
    <View style={{ gap: 12 }}>
      {favors.error ? <Banner text={errorMessage(favors.error)} /> : null}
      <Card>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <AppText variant="heading">{t('favor.balances')}</AppText>
          <Button compact title={t('favor.ask')} icon="hand-left-outline" disabled={balances.length === 0}
            onPress={() => router.push('/favor/new')} />
        </Row>
        <AppText variant="small">{t('favor.rules')}</AppText>
        {balances.length === 0 && !favors.isLoading ? <AppText variant="muted">{t('favor.noFriends')}</AppText> : null}
        {balances.map((balance) => (
          <Row key={balance.username} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Text style={styles.name} numberOfLines={1}>
              {balance.fullName} <Text style={styles.handle}>@{balance.username}</Text>
            </Text>
            <Row gap={6}>
              {balance.openFavorId ? <Badge text={t('favor.inProgress')} tone="info" /> : null}
              <Badge text={t(BALANCE[balance.balance].key)} tone={BALANCE[balance.balance].tone} />
            </Row>
          </Row>
        ))}
      </Card>

      {forOthers.length > 0 && <AppText variant="heading">{t('favor.forOthers')}</AppText>}
      {forOthers.map((favor) => <FavorCard key={favor.id} favor={favor} />)}
      {mine.length > 0 && <AppText variant="heading">{t('favor.mine')}</AppText>}
      {mine.map((favor) => <FavorCard key={favor.id} favor={favor} />)}

      {open.length === 0 && history.length === 0 && !favors.isLoading ? (
        <Card><EmptyState icon="hand-left-outline" title={t('favor.emptyTitle')} text={t('favor.emptyText')} /></Card>
      ) : null}
      {history.length > 0 && <AppText variant="heading">{t('favor.history')}</AppText>}
      {history.map((favor) => <FavorCard key={favor.id} favor={favor} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  name: { color: colors.text, fontWeight: '700', flexShrink: 1 },
  handle: { color: colors.faint, fontWeight: '500' },
});
