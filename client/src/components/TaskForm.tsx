import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { localDate } from '@/lib/dates';
import { currentPosition } from '@/lib/location';
import { isFriend, useFriends, useSaveTask } from '@/lib/queries';
import { CATEGORIES, DEFAULT_CATEGORY, DEFAULT_COORDS, PRIORITIES, type Task, type TaskInput } from '@/lib/types';

import { DateField } from './DateField';
import { LocationPicker } from './LocationPicker';
import { isValidRadius, RADIUS_MIN, RadiusPicker } from './RadiusPicker';
import { colors } from './theme';
import { AppText, Banner, Button, Card, ChipGroup, MultiChipGroup, Row, TextField, ToggleRow } from './ui';

const RADIUS_OPTIONS = [50, 100, 150, 300, 500, 1000] as const;

function initialInput(task?: Task): TaskInput {
  if (task) {
    const { title, category, priority, dueDate, isRecurring, requiresLocation, latitude, longitude, radius, requiresBiometrics } = task;
    return {
      title, category, priority, dueDate, isRecurring, requiresLocation, requiresBiometrics,
      // Cei care au refuzat nu sunt bifați; dacă îi bifezi din nou, primesc o invitație nouă.
      participants: (task.participants ?? []).filter((person) => person.status !== 'DECLINED').map((person) => person.username),
      latitude: latitude || DEFAULT_COORDS.latitude, longitude: longitude || DEFAULT_COORDS.longitude, radius: radius || 150,
    };
  }
  return {
    title: '', category: DEFAULT_CATEGORY, priority: 'Medium', dueDate: localDate(), isRecurring: false,
    requiresLocation: false, ...DEFAULT_COORDS, radius: 150, requiresBiometrics: false, participants: [],
  };
}

/** Formular comun pentru crearea și editarea unei activități (telefon și web). */
export function TaskForm({ task }: { task?: Task }) {
  const { t } = useI18n();
  const [input, setInput] = useState<TaskInput>(() => initialInput(task));
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const save = useSaveTask();
  const friends = useFriends();
  const set = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => setInput((current) => ({ ...current, [key]: value }));

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
    if (!input.title.trim()) {
      setError(t('form.titleRequired'));
      return;
    }
    if (input.requiresLocation && !isValidRadius(input.radius)) {
      setError(t('form.radiusInvalid'));
      return;
    }
    // Fără locație raza nu contează, dar serverul o vrea validă.
    const radius = isValidRadius(input.radius) ? input.radius : 150;
    try {
      await save.mutateAsync({ id: task?.id, input: { ...input, radius, title: input.title.trim() } });
      if (router.canGoBack()) router.back();
      else router.replace('/tasks');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  // Prietenii actuali, plus cei deja în activitate (invitați sau intrați din comunitate, chiar dacă nu sunteți prieteni).
  const declined = new Set((task?.participants ?? []).filter((person) => person.status === 'DECLINED').map((person) => person.username));
  const friendOptions = Array.from(new Set([
    ...(friends.data ?? []).filter(isFriend).map((friend) => friend.username), ...input.participants, ...declined,
  ]));

  return (
    <View style={{ gap: 14 }}>
      {error ? <Banner text={error} onClose={() => setError(null)} /> : null}
      <Card>
        <TextField label={t('form.title')} value={input.title} onChangeText={(value) => set('title', value)}
          placeholder={t('form.titlePlaceholder')} maxLength={255} autoFocus={!task} />
        <Text style={styles.label}>{t('form.category')}</Text>
        <ChipGroup options={CATEGORIES} value={input.category} onChange={(value) => set('category', value)}
          labels={Object.fromEntries(CATEGORIES.map((key) => [key, t(`category.${key}`)]))} />
        <Text style={styles.label}>{t('form.priority')}</Text>
        <ChipGroup options={PRIORITIES} value={input.priority} onChange={(value) => set('priority', value)}
          labels={Object.fromEntries(PRIORITIES.map((key) => [key, t(`priority.${key}`)]))} />
        <DateField label={t('form.dueDate')} value={input.dueDate} onChange={(value) => set('dueDate', value)} />
      </Card>

      <Card>
        <ToggleRow icon="repeat" label={t('form.daily')} description={t('form.dailyHint')}
          value={input.isRecurring} onChange={(value) => set('isRecurring', value)} />
        <ToggleRow icon="finger-print" label={t('form.biometricsToggle')} description={t('form.biometricsHint')}
          value={input.requiresBiometrics} onChange={(value) => set('requiresBiometrics', value)} />
        <ToggleRow icon="location-outline" label={t('form.locationToggle')} description={t('form.locationHint')}
          value={input.requiresLocation} onChange={(value) => {
            set('requiresLocation', value);
            // Pinul pornește de la locația curentă, dacă nu a fost deja ales.
            if (value && input.latitude === DEFAULT_COORDS.latitude && input.longitude === DEFAULT_COORDS.longitude) {
              void locateMe();
            }
          }} />
        {input.requiresLocation && (
          <View style={{ gap: 10 }}>
            <LocationPicker value={{ latitude: input.latitude, longitude: input.longitude }}
              radius={isValidRadius(input.radius) ? input.radius : RADIUS_MIN}
              onChange={(value) => setInput((current) => ({ ...current, ...value }))} />
            <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <Text style={{ color: colors.muted, fontSize: 12.5 }}>
                {input.latitude.toFixed(5)}, {input.longitude.toFixed(5)}
              </Text>
              <Button compact variant="secondary" title={t('form.myLocation')} icon="locate" loading={locating} onPress={locateMe} />
            </Row>
            <Text style={styles.label}>{t('form.radius')}</Text>
            <RadiusPicker presets={RADIUS_OPTIONS} value={input.radius} onChange={(value) => set('radius', value)} />
          </View>
        )}
      </Card>

      {friendOptions.length > 0 && (
        <Card>
          <Text style={styles.label}>{t('form.withFriends')}</Text>
          <MultiChipGroup options={friendOptions} values={input.participants} onChange={(value) => set('participants', value)}
            labels={Object.fromEntries(friendOptions.map((name) => [name,
              declined.has(name) && !input.participants.includes(name) ? t('form.declinedSuffix', { username: name }) : `@${name}`]))} />
          <AppText variant="small">{t('form.withFriendsHint')}</AppText>
        </Card>
      )}

      <Button title={task ? t('form.saveChanges') : t('form.add')} icon="checkmark" loading={save.isPending} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.muted, fontSize: 13, fontWeight: '700' },
});
