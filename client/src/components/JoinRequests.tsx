import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { showMessage } from '@/lib/dialogs';
import { useJoinRequestAction } from '@/lib/queries';
import type { Task } from '@/lib/types';

import { colors } from './theme';
import { Button, Row } from './ui';

export const openProfile = (username: string) => router.push({ pathname: '/user/[username]', params: { username } });

/** Cererile de participare din comunitate la o activitate pe care o organizez: aprob sau refuz. */
export function JoinRequests({ task }: { task: Task }) {
  const { t, tp } = useI18n();
  const review = useJoinRequestAction();
  const requests = task.joinRequests ?? [];
  if (requests.length === 0) return null;

  const answer = async (username: string, approve: boolean) => {
    try {
      await review.mutateAsync({ taskId: task.id, username, approve });
    } catch (error) {
      showMessage(t('card.actionFailed'), errorMessage(error));
    }
  };

  return (
    <View style={styles.box}>
      <Text style={styles.title}>{t('requests.title')} · {tp('plural.joinRequests', requests.length)}</Text>
      {requests.map((request) => (
        <Row key={request.username} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Pressable accessibilityRole="link" accessibilityLabel={t('chat.openProfile', { name: request.fullName })}
            onPress={() => openProfile(request.username)} style={{ flex: 1, minWidth: 140 }}>
            <Text style={styles.name} numberOfLines={1}>{request.fullName}</Text>
            <Text style={styles.handle} numberOfLines={1}>@{request.username}</Text>
          </Pressable>
          <Row gap={6}>
            <Button compact title={t('requests.approve')} icon="checkmark" loading={review.isPending}
              onPress={() => answer(request.username, true)} />
            <Button compact variant="ghost" title={t('group.decline')} onPress={() => answer(request.username, false)} />
          </Row>
        </Row>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  title: { color: colors.cyan, fontWeight: '800', fontSize: 13.5 },
  name: { color: colors.text, fontWeight: '700' },
  handle: { color: colors.faint, fontSize: 12.5 },
});
