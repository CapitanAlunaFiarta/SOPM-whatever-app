import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { CalendarView } from '@/components/CalendarView';
import { TaskCard } from '@/components/TaskCard';
import { Banner, Button, Card, ChipGroup, EmptyState, Screen, Segmented, TextField } from '@/components/ui';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useTasks } from '@/lib/queries';
import { isMember, type Task } from '@/lib/types';

const FILTERS = ['active', 'invites', 'overdue', 'completed', 'canceled', 'shared', 'all'] as const;
type Filter = (typeof FILTERS)[number];

const matches: Record<Filter, (task: Task) => boolean> = {
  active: (task) => isMember(task) && (task.status === 'Upcoming' || task.status === 'Overdue'),
  invites: (task) => task.myStatus === 'INVITED',
  overdue: (task) => isMember(task) && task.status === 'Overdue',
  completed: (task) => task.status === 'Completed' || task.completedToday,
  canceled: (task) => task.status === 'Canceled',
  shared: (task) => !task.isOwner || (task.participants ?? []).some((person) => person.status !== 'DECLINED'),
  all: () => true,
};

export default function TasksScreen() {
  const { t } = useI18n();
  const tasks = useTasks();
  const [filter, setFilter] = useState<Filter>('active');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'calendar'>('list');

  const visible = useMemo(() => (tasks.data ?? [])
    .filter(matches[filter])
    .filter((task) => `${task.title} ${task.description ?? ''} ${t(`category.${task.category}`)}`.toLowerCase()
      .includes(search.trim().toLowerCase())),
  [tasks.data, filter, search, t]);

  return (
    <Screen title={t('tabs.tasks')} subtitle={t('tasks.subtitle', { count: tasks.data?.length ?? 0 })}
      right={<Button compact title={t('tasks.new')} icon="add" onPress={() => router.push('/task/new')} />}
      refreshing={tasks.isRefetching} onRefresh={() => tasks.refetch()}>
      {tasks.error ? <Banner text={errorMessage(tasks.error)} /> : null}
      <Segmented value={view} onChange={setView} options={[
        { value: 'list', label: t('tasks.viewList'), icon: 'list-outline' },
        { value: 'calendar', label: t('tasks.viewCalendar'), icon: 'calendar-outline' },
      ]} />
      {view === 'calendar' ? <CalendarView tasks={tasks.data ?? []} /> : (
        <>
          <TextField value={search} onChangeText={setSearch} placeholder={t('tasks.search')} />
          <ChipGroup options={FILTERS} value={filter} onChange={setFilter}
            labels={Object.fromEntries(FILTERS.map((key) => [key, t(`filter.${key}`)]))} />
          {tasks.isLoading ? null : visible.length === 0 ? (
            <Card><EmptyState icon="list-outline" title={t('tasks.emptyTitle')} text={t('tasks.emptyText')} /></Card>
          ) : (
            visible.map((task) => <TaskCard key={task.id} task={task} />)
          )}
        </>
      )}
    </Screen>
  );
}
