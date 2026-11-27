import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { TaskCard } from '@/components/TaskCard';
import { Banner, Button, Card, ChipGroup, EmptyState, Screen, TextField } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useTasks } from '@/lib/queries';
import type { Task } from '@/lib/types';

const FILTERS = ['Active', 'Restante', 'Finalizate', 'Anulate', 'Partajate', 'Toate'] as const;
type Filter = (typeof FILTERS)[number];

const matches: Record<Filter, (task: Task) => boolean> = {
  Active: (task) => task.isOwner && (task.status === 'Upcoming' || task.status === 'Overdue'),
  Restante: (task) => task.isOwner && task.status === 'Overdue',
  Finalizate: (task) => task.status === 'Completed' || task.completedToday,
  Anulate: (task) => task.status === 'Canceled',
  Partajate: (task) => !task.isOwner || Boolean(task.friend),
  Toate: () => true,
};

export default function TasksScreen() {
  const tasks = useTasks();
  const [filter, setFilter] = useState<Filter>('Active');
  const [search, setSearch] = useState('');

  const visible = useMemo(() => (tasks.data ?? [])
    .filter(matches[filter])
    .filter((task) => `${task.title} ${task.category}`.toLowerCase().includes(search.trim().toLowerCase())),
  [tasks.data, filter, search]);

  return (
    <Screen title="Activități" subtitle={`${tasks.data?.length ?? 0} în total`}
      right={<Button compact title="Nouă" icon="add" onPress={() => router.push('/task/new')} />}
      refreshing={tasks.isRefetching} onRefresh={() => tasks.refetch()}>
      {tasks.error ? <Banner text={errorMessage(tasks.error)} /> : null}
      <TextField value={search} onChangeText={setSearch} placeholder="Caută după titlu sau categorie…" />
      <ChipGroup options={FILTERS} value={filter} onChange={setFilter} />
      {tasks.isLoading ? null : visible.length === 0 ? (
        <Card><EmptyState icon="list-outline" title="Nimic aici" text="Schimbă filtrul sau adaugă o activitate." /></Card>
      ) : (
        visible.map((task) => <TaskCard key={task.id} task={task} />)
      )}
    </Screen>
  );
}
