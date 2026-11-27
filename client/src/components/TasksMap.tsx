import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Callout, Circle, Marker } from 'react-native-maps';

import { nativeMapsAvailable } from '@/lib/maps';
import { STATUS_LABELS, type Coordinates, type Task } from '@/lib/types';

import { colors } from './theme';
import { AppText, Banner } from './ui';

/** Harta activităților cu locație (telefon). Pe web: TasksMap.web.tsx. */
export function TasksMap({ tasks, center, onSelect }: {
  tasks: Task[];
  center: Coordinates;
  onSelect?: (task: Task) => void;
}) {
  if (!nativeMapsAvailable) {
    return <Banner tone="info" text="Harta nu e disponibilă în această versiune Android. Mai jos vezi distanța până la fiecare activitate." />;
  }
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
                  <AppText style={{ color: '#444' }} variant="small">{STATUS_LABELS[task.status]} · raza {task.radius} m</AppText>
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
