import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { localDate } from '@/lib/dates';
import { currentPosition } from '@/lib/location';
import { useFavors, useRequestFavor } from '@/lib/queries';
import { CATEGORIES, DEFAULT_CATEGORY, DEFAULT_COORDS, type FavorInput } from '@/lib/types';

import { DateField } from './DateField';
import { LocationPicker } from './LocationPicker';
import { colors } from './theme';
import { AppText, Banner, Button, Card, ChipGroup, EmptyState, Row, TextField } from './ui';

const RADIUS_OPTIONS = ['50', '100', '150', '300', '500'] as const;

/** Cererea unui favor: prietenul, ce să facă, până când și locul unde face poza de confirmare. */
export function FavorForm({ friend: initialFriend }: { friend?: string }) {
  const { t } = useI18n();
  const favors = useFavors();
  const save = useRequestFavor();
  const balances = favors.data?.balances ?? [];
  const [input, setInput] = useState<FavorInput>({
    friend: initialFriend ?? '', title: '', details: '', category: DEFAULT_CATEGORY, dueDate: localDate(1),
    ...DEFAULT_COORDS, radius: 150,
  });
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const set = <K extends keyof FavorInput>(key: K, value: FavorInput[K]) => setInput((current) => ({ ...current, [key]: value }));

  const selected = balances.find((balance) => balance.username === input.friend);
  const blocked = Boolean(selected && (selected.balance === 'I_OWE' || selected.openFavorId));
  const status = !selected ? null
    : selected.openFavorId ? { tone: 'danger' as const, text: t('favor.form.open') }
      : selected.balance === 'I_OWE' ? { tone: 'danger' as const, text: t('favor.form.youOwe', { username: selected.username }) }
        : selected.balance === 'THEY_OWE' ? { tone: 'info' as const, text: t('favor.form.theyOwe', { username: selected.username }) }
          : { tone: 'info' as const, text: t('favor.form.even', { username: selected.username }) };

  const locateMe = async () => {
    setLocating(true);
    try {
      const position = await currentPosition();
      setInput((current) => ({ ...current, latitude: position.latitude, longitude: position.longitude }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLocating(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (!input.friend) {
      setError(t('favor.form.friend'));
      return;
    }
    if (!input.title.trim()) {
      setError(t('favor.form.title'));
      return;
    }
    try {
      await save.mutateAsync({ ...input, title: input.title.trim(), details: input.details.trim() });
      if (router.canGoBack()) router.back();
      else router.replace({ pathname: '/social', params: { section: 'favors' } });
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (!favors.isLoading && balances.length === 0) {
    return <Card><EmptyState icon="people-outline" title={t('favor.emptyTitle')} text={t('favor.noFriends')} /></Card>;
  }

  const radiusOptions = Array.from(new Set<string>([...RADIUS_OPTIONS, String(input.radius)])).sort((a, b) => Number(a) - Number(b));
  return (
    <View style={{ gap: 14 }}>
      {error ? <Banner text={error} onClose={() => setError(null)} /> : null}
      <Card>
        <Text style={styles.label}>{t('favor.form.friend')}</Text>
        <ChipGroup options={balances.map((balance) => balance.username)} value={input.friend} onChange={(value) => set('friend', value)}
          labels={Object.fromEntries(balances.map((balance) => [balance.username, `@${balance.username}`]))} />
        {status ? <Banner tone={status.tone} text={status.text} /> : null}
        <AppText variant="small">{t('favor.rules')}</AppText>
      </Card>
      <Card>
        <TextField label={t('favor.form.title')} value={input.title} onChangeText={(value) => set('title', value)}
          placeholder={t('favor.form.titlePlaceholder')} maxLength={255} />
        <TextField label={t('favor.form.details')} value={input.details} onChangeText={(value) => set('details', value)}
          maxLength={1000} multiline />
        <Text style={styles.label}>{t('form.category')}</Text>
        <ChipGroup options={CATEGORIES} value={input.category} onChange={(value) => set('category', value)}
          labels={Object.fromEntries(CATEGORIES.map((key) => [key, t(`category.${key}`)]))} />
        <DateField label={t('form.dueDate')} value={input.dueDate} onChange={(value) => set('dueDate', value)} />
      </Card>
      <Card>
        <Text style={styles.label}>{t('favor.form.place')}</Text>
        <AppText variant="small">{t('favor.form.placeHint')}</AppText>
        <LocationPicker value={{ latitude: input.latitude, longitude: input.longitude }} radius={input.radius}
          onChange={(value) => setInput((current) => ({ ...current, ...value }))} />
        <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Text style={{ color: colors.muted, fontSize: 12.5 }}>
            {input.latitude.toFixed(5)}, {input.longitude.toFixed(5)}
          </Text>
          <Button compact variant="secondary" title={t('form.myLocation')} icon="locate" loading={locating} onPress={locateMe} />
        </Row>
        <Text style={styles.label}>{t('form.radius')}</Text>
        <ChipGroup options={radiusOptions} value={String(input.radius)} onChange={(value) => set('radius', Number(value))} />
      </Card>
      <Button title={t('favor.form.submit')} icon="send" loading={save.isPending} disabled={blocked} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.muted, fontSize: 13, fontWeight: '700' },
});
