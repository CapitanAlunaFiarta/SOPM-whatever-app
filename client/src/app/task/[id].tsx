import { useLocalSearchParams } from 'expo-router';

import { TaskForm } from '@/components/TaskForm';
import { Card, EmptyState, Loading, Screen } from '@/components/ui';
import { useTasks } from '@/lib/queries';

export default function EditTaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tasks = useTasks();
  const task = tasks.data?.find((item) => String(item.id) === id && item.isOwner);

  if (tasks.isLoading) return <Loading />;
  return (
    <Screen>
      {task ? <TaskForm task={task} /> : (
        <Card><EmptyState icon="help-circle-outline" title="Activitatea nu există" text="Poate a fost ștearsă sau nu îți aparține." /></Card>
      )}
    </Screen>
  );
}
