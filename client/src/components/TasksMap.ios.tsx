import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Callout, Circle, Marker } from 'react-native-maps';

import { useI18n } from '@/i18n';
import type { Coordinates, Task } from '@/lib/types';

import { colors } from './theme';
import { AppText } from './ui';

/** Harta activităților cu locație pe iOS (Apple Maps, fără cheie). Android: TasksMap.tsx, web: TasksMap.web.tsx. */
export function TasksMap({ tasks, center, onSelect }: {
  tasks: Task[];
  center: Coordinates;
  onSelect?: (task: Task) => void;
}) {
  const { t } = useI18n();
  return (
    <View style={styles.wrapper}>
      <MapView style={StyleSheet.absoluteFill} initialRegion={{ ...center, latitudeDelta: 0.06, longitudeDelta: 0.06 }}
        showsUserLocation showsMyLocationButton>
        {tasks.map((task) => (
          <Fragment key={task.id}>
            <Marker coordinate={{ latitude: task.latitude, longitude: task.longitude }}
              pinColor={task.status === 'Overdue' ? colors.amber : task.status === 'Completed' ? colors.green : colors.indigo}
              onCalloutPress={() => onSelect?.(task)}>
              <Callout>
                <View style={{ maxWidth: 220 }}>
                  <AppText style={{ color: '#111', fontWeight: '700' }}>{task.title}</AppText>
                  <AppText style={{ color: '#444' }} variant="small">
                    {t('map.taskLabel', { status: t(`status.${task.status}`), radius: task.radius })}
                  </AppText>
                </View>
              </Callout>
            </Marker>
            <Circle center={{ latitude: task.latitude, longitude: task.longitude }} radius={task.radius}
              strokeColor={colors.cyan} fillColor="rgba(56,189,248,0.14)" />
          </Fragment>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, minHeight: 320, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
});
