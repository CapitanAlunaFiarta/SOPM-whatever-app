import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { confirmAction, showMessage } from '@/lib/dialogs';
import { focusAvailable } from '@/lib/focus';
import { useCompleteTask, useInviteResponse, useShareActivity, useTaskAction } from '@/lib/queries';
import { isMember, type Task } from '@/lib/types';

import { Button } from './ui';

/** Se poate confirma acum: sunt membru, e activă, nu mi-am făcut partea și (dacă e recurentă) a revenit. */
export function canCompleteTask(task: Task): boolean {
  const active = task.status === 'Upcoming' || task.status === 'Overdue';
  return isMember(task) && active && !task.confirmedByMe && !task.nextOn;
}

/**
 * Butoanele unei activități, aceleași pe card și pe ecranul de detalii: răspunsul la invitație, confirmarea,
 * focus, chat, trimiterea în comunitate, freeze, editarea, anularea și ștergerea. Compact (Acasă, Hartă):
 * doar răspunsul la invitație și confirmarea.
 */
export function TaskActions({ task, compact, onDeleted }: { task: Task; compact?: boolean; onDeleted?: () => void }) {
  const { t, tp } = useI18n();
  const complete = useCompleteTask();
  const action = useTaskAction();
  const invite = useInviteResponse();
  const share = useShareActivity();
  const active = task.status === 'Upcoming' || task.status === 'Overdue';
  const member = isMember(task);
  const invited = task.myStatus === 'INVITED';
  const canComplete = canCompleteTask(task);

  const onComplete = async () => {
    try {
      const result = await complete.mutateAsync(task);
      showMessage(t('card.done'), t('card.result', {
        streak: tp('plural.days', result.streak), points: tp('plural.points', result.points),
      }));
    } catch (error) {
      showMessage(t('card.confirmFailed'), errorMessage(error));
    }
  };

  const respond = async (accept: boolean) => {
    if (!accept && !(await confirmAction(t('group.declineTitle'), t('group.declineText'), t('group.decline')))) return;
    try {
      await invite.mutateAsync({ task, accept });
      // După acceptare se deschide direct chatul activității.
      if (accept) router.push(`/chat/${task.id}`);
    } catch (error) {
      showMessage(t('card.actionFailed'), errorMessage(error));
    }
  };

  // Invitația deschisă în chatul comunității (oricine cere să participe, organizatorul aprobă).
  const shareWithCommunity = async () => {
    if (!(await confirmAction(t('card.shareTitle'), t('card.shareText'), t('card.shareConfirm')))) return;
    try {
      await share.mutateAsync(task.id);
      showMessage(t('card.done'), t('community.shared'));
    } catch (error) {
      showMessage(t('card.actionFailed'), errorMessage(error));
    }
  };

  const run = async (kind: 'cancel' | 'freeze' | 'delete') => {
    const questions = {
      cancel: [t('card.cancelTitle'), t('card.cancelText'), t('card.cancelConfirm')],
      freeze: [t('card.freezeTitle'), t('card.freezeText'), t('card.freezeConfirm')],
      delete: [t('card.deleteTitle'), t('card.deleteText'), t('common.delete')],
    } as const;
    const [title, message, label] = questions[kind];
    if (!(await confirmAction(title, message, label))) return;
    try {
      await action.mutateAsync({ task, action: kind });
      if (kind === 'delete') onDeleted?.();
    } catch (error) {
      showMessage(t('card.actionFailed'), errorMessage(error));
    }
  };

  if (invited) {
    return (
      <View style={styles.actions}>
        <Button compact title={t('group.accept')} icon="checkmark" loading={invite.isPending} onPress={() => respond(true)} />
        <Button compact variant="ghost" title={t('group.decline')} onPress={() => respond(false)} />
      </View>
    );
  }
  if (!member || (compact && !canComplete)) return null;
  return (
    <View style={styles.actions}>
      {canComplete && (
        <Button compact title={t('card.confirm')} icon="checkmark-circle" loading={complete.isPending} onPress={onComplete} />
      )}
      {focusAvailable && canComplete && !compact && (
        <Button compact variant="secondary" title={t('focus.button')} icon="leaf-outline" onPress={() => router.push(`/focus/${task.id}`)} />
      )}
      {task.chat?.available && !compact && (
        <Button compact variant="secondary" icon="chatbubbles-outline" onPress={() => router.push(`/chat/${task.id}`)}
          title={task.chat.messageCount > 0 ? t('group.chatCount', { count: task.chat.messageCount }) : t('group.chat')} />
      )}
      {task.isOwner && task.status === 'Upcoming' && !compact && (
        <Button compact variant="secondary" title={t('card.share')} icon="megaphone-outline" loading={share.isPending}
          onPress={shareWithCommunity} />
      )}
      {task.isOwner && task.status === 'Overdue' && !compact && (
        <Button compact variant="secondary" title={t('card.freeze')} icon="snow-outline" loading={action.isPending} onPress={() => run('freeze')} />
      )}
      {task.isOwner && active && !compact && (
        <Button compact variant="secondary" title={t('card.edit')} icon="create-outline" onPress={() => router.push(`/task/${task.id}`)} />
      )}
      {task.isOwner && active && !compact && (
        <Button compact variant="ghost" title={t('card.cancel')} onPress={() => run('cancel')} />
      )}
      {task.isOwner && !compact && <Button compact variant="ghost" title={t('common.delete')} icon="trash-outline" onPress={() => run('delete')} />}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
