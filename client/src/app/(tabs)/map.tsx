import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { TaskCard } from '@/components/TaskCard';
import { TasksMap } from '@/components/TasksMap';
import { AppText, Banner, Card, EmptyState, Screen } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { currentPosition, distanceMeters } from '@/lib/location';
import { useTasks } from '@/lib/queries';
import { DEFAULT_COORDS, type Coordinates } from '@/lib/types';

export default function MapScreen() {
  const tasks = useTasks();
  const [here, setHere] = useState<Coordinates | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    currentPosition().then(setHere).catch((error) => setLocationError(errorMessage(error)));
  }, []);

  const located = (tasks.data ?? []).filter((task) => task.requiresLocation && task.isOwner
    && (task.status === 'Upcoming' || task.status === 'Overdue'));
  const sorted = here ? [...located].sort((a, b) => distanceMeters(here, a) - distanceMeters(here, b)) : located;

  return (
    <Screen title="Hartă" subtitle="Activitățile care se confirmă într-un loc anume." refreshing={tasks.isRefetching}
      onRefresh={() => tasks.refetch()}>
      {locationError ? <Banner tone="info" text={locationError} onClose={() => setLocationError(null)} /> : null}
      <View style={{ height: 380 }}>
        <TasksMap tasks={located} center={here ?? (located[0] ?? DEFAULT_COORDS)} />
      </View>
      {located.length === 0 ? (
        <Card><EmptyState icon="location-outline" title="Nicio activitate cu locație"
          text="Când creezi o activitate, activează „Confirmare în locație” și alege locul pe hartă." /></Card>
      ) : sorted.map((task) => (
        <View key={task.id} style={{ gap: 4 }}>
          {here ? <AppText variant="small">la {Math.round(distanceMeters(here, task))} m de tine</AppText> : null}
          <TaskCard task={task} compact />
        </View>
      ))}
    </Screen>
  );
}
