import { router } from 'expo-router';
import { View } from 'react-native';

import { JoinRequests } from '@/components/JoinRequests';
import { ProgressRing } from '@/components/ProgressRing';
import { TaskCard } from '@/components/TaskCard';
import { AppText, Banner, Button, Card, EmptyState, Row, Screen, StatTile } from '@/components/ui';
import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { localDate, monthKey } from '@/lib/dates';
import { useFavors, useFriends, useMe, useRecap, useTasks } from '@/lib/queries';
import { favorNeedsMe, isMember, type Task } from '@/lib/types';

// De făcut: activități active la care sunt membru și la care nu mi-am făcut încă partea.
const isOpen = (task: Task) => (task.status === 'Upcoming' || task.status === 'Overdue') && !task.confirmedByMe;

export default function HomeScreen() {
  const { t, tp } = useI18n();
  const { user } = useAuth();
  const me = useMe();
  const tasks = useTasks();
  const recap = useRecap(monthKey());
  const favors = useFavors();
  const favorsWaiting = (favors.data?.favors ?? []).filter(favorNeedsMe).length;
  const friends = useFriends();
  const friendRequests = (friends.data ?? []).filter((friend) => friend.status === 'INCOMING').length;
  const current = me.data ?? user;
  const mine = (tasks.data ?? []).filter(isMember);
  const invites = (tasks.data ?? []).filter((task) => task.myStatus === 'INVITED');
  // Activitățile mele trimise în comunitate la care așteaptă cereri de participare.
  const withRequests = (tasks.data ?? []).filter((task) => task.isOwner && (task.joinRequests ?? []).length > 0);
  const open = mine.filter(isOpen);
  const overdue = open.filter((task) => task.status === 'Overdue');
  const streak = current?.streak ?? 0;
  const firstName = current?.fullName?.split(' ')[0] ?? '';

  // Progresul de azi: ce ai confirmat azi, din tot ce era de făcut azi (scadente azi, restante,
  // activitățile zilnice). Activitățile programate pentru zilele următoare nu intră în calcul.
  const today = localDate();
  const doneToday = mine.filter((task) => task.completedToday).length;
  const planned = doneToday + open.filter((task) => task.dueDate <= today).length;
  const percent = planned > 0 ? Math.round((doneToday / planned) * 100) : null;
  const progressText = planned === 0 ? t('home.progressNone')
    : doneToday === planned ? t('home.progressAll') : t('home.progressDone', { done: doneToday, total: planned });

  const topCategory = recap.data && recap.data.total > 0
    ? [...recap.data.categories].sort((a, b) => b.count - a.count)[0]?.category : undefined;

  return (
    <Screen title={t('home.greeting', { name: firstName })} subtitle={t('home.subtitle')}
      refreshing={tasks.isRefetching || me.isRefetching}
      onRefresh={() => { tasks.refetch(); me.refetch(); recap.refetch(); }}>
      {tasks.error ? <Banner text={errorMessage(tasks.error)} /> : null}

      <Card>
        <Row style={{ flexWrap: 'wrap' }} gap={18}>
          <ProgressRing percent={tasks.isLoading ? null : percent}
            label={tasks.isLoading ? t('common.loading') : percent === null ? t('home.progressNone')
              : t('home.progressLabel', { percent })} />
          <View style={{ flex: 1, minWidth: 170, gap: 4 }}>
            <AppText variant="muted">{t('home.progressTitle')}</AppText>
            <AppText variant="heading">{tasks.isLoading ? t('common.loading') : progressText}</AppText>
            <AppText variant="muted" style={{ marginTop: 8 }}>{t('stats.streak')}</AppText>
            <AppText variant="big">🔥 {tp('plural.days', streak)}</AppText>
            <AppText variant="small">
              {doneToday > 0 ? t('home.streakSafe') : streak > 0 ? t('home.streakKeep') : t('home.streakStart')}
            </AppText>
          </View>
        </Row>
        <Button title={t('task.newTitle')} icon="add" onPress={() => router.push('/task/new')} />
      </Card>

      {favorsWaiting > 0 && (
        <Card>
          <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 180, gap: 2 }}>
              <AppText variant="heading">{t('social.favors')}</AppText>
              <AppText variant="muted">{tp('plural.favorsWaiting', favorsWaiting)}</AppText>
            </View>
            <Button compact title={t('home.openFavors')} icon="hand-left-outline"
              onPress={() => router.push({ pathname: '/social', params: { section: 'favors' } })} />
          </Row>
        </Card>
      )}

      {(friendRequests > 0 || withRequests.length > 0) && (
        <Card>
          <AppText variant="heading">{t('home.requestsTitle')}</AppText>
          {friendRequests > 0 && (
            <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <AppText variant="muted" style={{ flex: 1, minWidth: 160 }}>{tp('plural.friendRequests', friendRequests)}</AppText>
              <Button compact title={t('home.openFriends')} icon="person-add-outline"
                onPress={() => router.push({ pathname: '/social', params: { section: 'friends' } })} />
            </Row>
          )}
          {withRequests.map((task) => (
            <View key={task.id} style={{ gap: 6 }}>
              <AppText style={{ fontWeight: '800' }}>{task.title}</AppText>
              <JoinRequests task={task} />
            </View>
          ))}
        </Card>
      )}

      {invites.length > 0 && (
        <>
          <AppText variant="heading">{t('home.invites')}</AppText>
          {invites.map((task) => <TaskCard key={task.id} task={task} compact />)}
        </>
      )}

      <Row style={{ flexWrap: 'wrap', alignItems: 'stretch' }}>
        <StatTile label={t('stats.points')} value={current?.points ?? 0} hint={t('stats.pointsHint')} tone="success" icon="star-outline" />
        <StatTile label={t('stats.freeze')} value={`${current?.freezesLeft ?? 3}/3`} hint={t('stats.freezeHintMonth')} tone="info" icon="snow-outline" />
        <StatTile label={t('stats.overdue')} value={overdue.length} hint={t('stats.overdueHint')} tone="warning" icon="alert-circle-outline" />
      </Row>

      <Card>
        <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <View style={{ flex: 1, minWidth: 190, gap: 2 }}>
            <AppText variant="heading">{t('recap.title')}</AppText>
            <AppText variant="muted">
              {recap.data ? tp('plural.monthDone', recap.data.total) : recap.error ? errorMessage(recap.error) : t('common.loading')}
            </AppText>
            {topCategory ? (
              <AppText variant="small">{t('recap.top', { category: t(`category.${topCategory}`) })}</AppText>
            ) : null}
          </View>
          <Button compact variant="secondary" title={t('recap.open')} icon="stats-chart-outline" onPress={() => router.push('/recap')} />
        </Row>
      </Card>

      <AppText variant="heading">{t('home.todo')}</AppText>
      {tasks.isLoading ? <AppText variant="muted">{t('common.loading')}</AppText>
        : open.length === 0 ? (
          <Card><EmptyState icon="sparkles-outline" title={t('home.allClearTitle')} text={t('home.allClearText')} /></Card>
        ) : (
          open.slice(0, 6).map((task) => <TaskCard key={task.id} task={task} compact />)
        )}
      {open.length > 6 && <Button variant="secondary" title={t('home.allActivities')} onPress={() => router.push('/tasks')} />}
    </Screen>
  );
}
