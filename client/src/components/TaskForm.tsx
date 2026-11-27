import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { errorMessage } from '@/lib/api';
import { localDate } from '@/lib/dates';
import { currentPosition } from '@/lib/location';
import { useFriends, useSaveTask } from '@/lib/queries';
import { CATEGORIES, DEFAULT_COORDS, PRIORITIES, PRIORITY_LABELS, type Task, type TaskInput } from '@/lib/types';

import { DateField } from './DateField';
import { LocationPicker } from './LocationPicker';
import { colors } from './theme';
import { Banner, Button, Card, ChipGroup, Row, TextField, ToggleRow } from './ui';

const RADIUS_OPTIONS = ['50', '100', '150', '300', '500', '1000'] as const;

function initialInput(task?: Task): TaskInput {
  if (task) {
    const { title, category, priority, dueDate, isRecurring, requiresLocation, latitude, longitude, radius, requiresBiometrics, friend } = task;
    return {
      title, category, priority, dueDate, isRecurring, requiresLocation, requiresBiometrics, friend,
      latitude: latitude || DEFAULT_COORDS.latitude, longitude: longitude || DEFAULT_COORDS.longitude, radius: radius || 150,
    };
  }
  return {
    title: '', category: 'Personal', priority: 'Medium', dueDate: localDate(), isRecurring: false,
    requiresLocation: false, ...DEFAULT_COORDS, radius: 150, requiresBiometrics: false, friend: '',
  };
}

/** Formular comun pentru crearea și editarea unei activități (telefon și web). */
export function TaskForm({ task }: { task?: Task }) {
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
      setError('Scrie un titlu pentru activitate.');
      return;
    }
    try {
      await save.mutateAsync({ id: task?.id, input: { ...input, title: input.title.trim() } });
      if (router.canGoBack()) router.back();
      else router.replace('/tasks');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const friendOptions = ['', ...(friends.data ?? []).map((friend) => friend.username)];
  const radiusOptions = Array.from(new Set<string>([...RADIUS_OPTIONS, String(input.radius)]))
    .sort((a, b) => Number(a) - Number(b));

  return (
    <View style={{ gap: 14 }}>
      {error ? <Banner text={error} onClose={() => setError(null)} /> : null}
      <Card>
        <TextField label="Ce vrei să faci?" value={input.title} onChangeText={(value) => set('title', value)}
          placeholder="Ex: Alerg 20 de minute" maxLength={255} autoFocus={!task} />
        <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '700' }}>Categorie</Text>
        <ChipGroup options={CATEGORIES} value={input.category} onChange={(value) => set('category', value)} />
        <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '700' }}>Prioritate</Text>
        <ChipGroup options={PRIORITIES} value={input.priority} onChange={(value) => set('priority', value)} labels={PRIORITY_LABELS} />
        <DateField label="Scadență" value={input.dueDate} onChange={(value) => set('dueDate', value)} />
      </Card>

      <Card>
        <ToggleRow icon="repeat" label="Zilnic" description="Rămâne activă și o poți confirma o dată pe zi."
          value={input.isRecurring} onChange={(value) => set('isRecurring', value)} />
        <ToggleRow icon="finger-print" label="Confirmare cu biometrie"
          description="Pe telefon: amprentă/Face ID. Pe web: passkey."
          value={input.requiresBiometrics} onChange={(value) => set('requiresBiometrics', value)} />
        <ToggleRow icon="location-outline" label="Confirmare în locație"
          description="Poți confirma doar când ești în raza aleasă."
          value={input.requiresLocation} onChange={(value) => {
            set('requiresLocation', value);
            // Pinul pornește de la locația curentă, dacă nu a fost deja ales.
            if (value && input.latitude === DEFAULT_COORDS.latitude && input.longitude === DEFAULT_COORDS.longitude) {
              void locateMe();
            }
          }} />
        {input.requiresLocation && (
          <View style={{ gap: 10 }}>
            <LocationPicker value={{ latitude: input.latitude, longitude: input.longitude }} radius={input.radius}
              onChange={(value) => setInput((current) => ({ ...current, ...value }))} />
            <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <Text style={{ color: colors.muted, fontSize: 12.5 }}>
                {input.latitude.toFixed(5)}, {input.longitude.toFixed(5)}
              </Text>
              <Button compact variant="secondary" title="Locația mea" icon="locate" loading={locating} onPress={locateMe} />
            </Row>
            <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '700' }}>Raza (metri)</Text>
            <ChipGroup options={radiusOptions} value={String(input.radius)} onChange={(value) => set('radius', Number(value))} />
          </View>
        )}
      </Card>

      {friendOptions.length > 1 && (
        <Card>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '700' }}>Partajează cu un prieten (opțional)</Text>
          <ChipGroup options={friendOptions} value={input.friend} onChange={(value) => set('friend', value)}
            labels={Object.fromEntries(friendOptions.map((name) => [name, name ? `@${name}` : 'Nimeni']))} />
        </Card>
      )}

      <Button title={task ? 'Salvează modificările' : 'Adaugă activitatea'} icon="checkmark" loading={save.isPending} onPress={submit} />
    </View>
  );
}
