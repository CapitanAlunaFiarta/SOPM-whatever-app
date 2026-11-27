import { router } from 'expo-router';
import { View } from 'react-native';

import { TaskCard } from '@/components/TaskCard';
import { AppText, Banner, Button, Card, EmptyState, Row, Screen, StatTile } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { pluralDays } from '@/lib/dates';
import { useMe, useTasks } from '@/lib/queries';

export default function HomeScreen() {
  const { user } = useAuth();
  const me = useMe();
  const tasks = useTasks();
  const current = me.data ?? user;
  const list = tasks.data ?? [];
  const today = list.filter((task) => task.isOwner && (task.status === 'Upcoming' || task.status === 'Overdue') && !task.completedToday);
  const overdue = today.filter((task) => task.status === 'Overdue');
  const doneToday = list.filter((task) => task.completedToday).length;
  const streak = current?.streak ?? 0;
  const firstName = current?.fullName?.split(' ')[0] ?? '';

  return (
    <Screen title={`Salut, ${firstName}!`} subtitle="Concentrează-te pe următorul pas."
      refreshing={tasks.isRefetching || me.isRefetching}
      onRefresh={() => { tasks.refetch(); me.refetch(); }}>
      {tasks.error ? <Banner text={errorMessage(tasks.error)} /> : null}

      <Card>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <View style={{ flex: 1, minWidth: 200, gap: 4 }}>
            <AppText variant="muted">Streak</AppText>
            <AppText variant="big">🔥 {pluralDays(streak)}</AppText>
            <AppText variant="small">
              {doneToday > 0 ? 'Ai finalizat azi — streak-ul e în siguranță.'
                : streak > 0 ? 'Finalizează o activitate azi ca să-l păstrezi.' : 'Finalizează o activitate ca să pornești un streak.'}
            </AppText>
          </View>
          <Button title="Activitate nouă" icon="add" onPress={() => router.push('/task/new')} />
        </Row>
      </Card>

      <Row style={{ flexWrap: 'wrap' }}>
        <StatTile label="Puncte" value={current?.points ?? 0} hint="activități finalizate" tone="success" icon="star-outline" />
        <StatTile label="Freeze" value={`${current?.freezesLeft ?? 3}/3`} hint="luna aceasta" tone="info" icon="snow-outline" />
        <StatTile label="Restante" value={overdue.length} hint="necesită atenție" tone="warning" icon="alert-circle-outline" />
      </Row>

      <AppText variant="heading">De făcut</AppText>
      {tasks.isLoading ? <AppText variant="muted">Se încarcă…</AppText>
        : today.length === 0 ? (
          <Card><EmptyState icon="sparkles-outline" title="Ești la zi" text="Nu ai activități active. Adaugă una nouă." /></Card>
        ) : (
          today.slice(0, 6).map((task) => <TaskCard key={task.id} task={task} compact />)
        )}
      {today.length > 6 && <Button variant="secondary" title="Toate activitățile" onPress={() => router.push('/tasks')} />}
    </Screen>
  );
}
