import { StyleSheet, View } from 'react-native';

import { STATUS_LABELS, type Coordinates, type Task } from '@/lib/types';

import { LeafletMap } from './leaflet/LeafletMap';
import { colors } from './theme';

/**
 * Harta activităților cu locație pe Android: Leaflet + OpenStreetMap într-un WebView,
 * fără cheie Google Maps. iOS: TasksMap.ios.tsx (Apple Maps), web: TasksMap.web.tsx.
 */
export function TasksMap({ tasks, center }: {
  tasks: Task[];
  center: Coordinates;
  onSelect?: (task: Task) => void;
}) {
  return (
    <View style={styles.wrapper}>
      <LeafletMap
        style={StyleSheet.absoluteFill}
        state={{
          mode: 'tasks',
          center: { latitude: center.latitude, longitude: center.longitude },
          tasks: tasks.map((task) => ({
            id: task.id,
            title: task.title,
            label: `${STATUS_LABELS[task.status]} · raza ${task.radius} m`,
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
  wrapper: { flex: 1, minHeight: 320, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
});
