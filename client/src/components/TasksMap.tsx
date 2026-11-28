import { StyleSheet, View } from 'react-native';

import { useI18n } from '@/i18n';
import type { Coordinates, Task } from '@/lib/types';

import { LeafletMap } from './leaflet/LeafletMap';
import { colors } from './theme';

/**
 * Harta activităților cu locație pe Android: Leaflet + OpenStreetMap într-un WebView,
 * fără cheie Google Maps. iOS: TasksMap.ios.tsx (Apple Maps), web: TasksMap.web.tsx.
 */
export function TasksMap({ tasks, center, minHeight = 320, preview }: {
  tasks: Task[];
  center: Coordinates;
  onSelect?: (task: Task) => void;
  /** Înălțimea minimă (ecranul de detalii folosește o hartă mai mică). */
  minHeight?: number;
  /** Hartă mică într-o pagină care se derulează: nu se trage cu degetul (pagina se derulează normal). */
  preview?: boolean;
}) {
  const { t } = useI18n();
  return (
    <View style={[styles.wrapper, { minHeight }]}>
      <LeafletMap
        style={StyleSheet.absoluteFill}
        state={{
          mode: 'tasks',
          preview,
          center: { latitude: center.latitude, longitude: center.longitude },
          tasks: tasks.map((task) => ({
            id: task.id,
            title: task.title,
            label: t('map.taskLabel', { status: t(`status.${task.status}`), radius: task.radius }),
            latitude: task.latitude,
            longitude: task.longitude,
            radius: task.radius,
            color: task.status === 'Overdue' ? colors.amber : task.status === 'Completed' ? colors.green : colors.indigo,
          })),
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
});
