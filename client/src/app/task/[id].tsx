import { useLocalSearchParams } from 'expo-router';

import { TaskForm } from '@/components/TaskForm';
import { Card, EmptyState, Loading, Screen } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useTasks } from '@/lib/queries';

export default function EditTaskScreen() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const tasks = useTasks();
  const task = tasks.data?.find((item) => String(item.id) === id && item.isOwner);

  if (tasks.isLoading) return <Loading />;
  return (
    <Screen>
      {task ? <TaskForm task={task} /> : (
        <Card><EmptyState icon="help-circle-outline" title={t('task.notFoundTitle')} text={t('task.notFoundText')} /></Card>
      )}
    </Screen>
  );
}
