import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { confirmAction, showMessage } from '@/lib/dialogs';
import { useFavorAction, useFavorPhoto, type FavorAction } from '@/lib/queries';
import type { Favor, FavorStatus } from '@/lib/types';

import { CATEGORY_ICONS } from './categories';
import { colors, radius, type Tone } from './theme';
import { Badge, Button } from './ui';

const STATUS_TONES: Record<FavorStatus, Tone> = {
  REQUESTED: 'info',
  ACCEPTED: 'accent',
  SUBMITTED: 'warning',
  COMPLETED: 'success',
  DECLINED: 'neutral',
  REFUSED: 'neutral',
  EXPIRED: 'neutral',
  CANCELED: 'neutral',
};

/**
 * Un favor, cu acțiunile potrivite pentru mine: cel rugat acceptă / refuză și face poza la locație,
 * cel care a cerut vede poza și o aprobă sau o respinge.
 */
export function FavorCard({ favor }: { favor: Favor }) {
  const { t, formatDate } = useI18n();
  const action = useFavorAction();
  const doer = favor.role === 'DOER';
  const friend = favor.friend.username;
  const [showPhoto, setShowPhoto] = useState(!doer && favor.status === 'SUBMITTED');
  const photo = useFavorPhoto(favor.id, showPhoto && favor.hasPhoto);

  const run = async (kind: FavorAction) => {
    const questions: Partial<Record<FavorAction, [string, string, string]>> = {
      decline: [t('favor.declineTitle'), t('favor.declineText', { username: friend }), t('favor.decline')],
      refuse: [t('favor.refuseTitle'), t('favor.refuseText', { username: friend }), t('favor.refuse')],
      cancel: [t('favor.cancelTitle'), t('favor.cancelText', { username: friend }), t('favor.cancelConfirm')],
      reject: [t('favor.rejectTitle'), t('favor.rejectText', { username: friend }), t('favor.reject')],
    };
    const question = questions[kind];
    if (question && !(await confirmAction(...question))) return;
    try {
      await action.mutateAsync({ favor, action: kind });
      if (kind === 'approve') showMessage(t('favor.status.COMPLETED'), t('favor.approved', { username: friend }));
    } catch (error) {
      showMessage(t('card.actionFailed'), errorMessage(error));
    }
  };

  const openMap = () => {
    const { latitude, longitude } = favor;
    Linking.openURL(`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`)
      .catch(() => undefined);
  };

  const hint = doer
    ? favor.status === 'REQUESTED' && favor.obligated ? t('favor.obligated')
      : favor.status === 'ACCEPTED' && favor.reviewNote ? t('favor.rejectedNote', { note: favor.reviewNote })
        : favor.status === 'SUBMITTED' ? t('favor.waitingApproval', { username: friend }) : null
    : favor.status === 'REQUESTED'
      ? `${t('favor.waitingAnswer', { username: friend })}${favor.obligated ? ` ${t('favor.obligatedRequester', { username: friend })}` : ''}`
      : favor.status === 'ACCEPTED' ? t('favor.waitingPhoto', { username: friend }) : null;
  const canTogglePhoto = favor.hasPhoto && (favor.status === 'COMPLETED' || favor.status === 'SUBMITTED');

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.icon}>
          <Ionicons name={CATEGORY_ICONS[favor.category] ?? 'hand-left-outline'} size={18} color={colors.violet} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.title} numberOfLines={2}>{favor.title}</Text>
          <Text style={styles.meta}>
            {doer ? t('card.from', { username: friend }) : t('favor.to', { username: friend })}
            {' · '}{t('favor.due', { date: formatDate(favor.dueDate, { inline: true }) })}
          </Text>
        </View>
        <Badge text={t(`favor.status.${favor.status}`)} tone={STATUS_TONES[favor.status]} />
      </View>
      {favor.details ? <Text style={styles.details}>{favor.details}</Text> : null}
      {hint ? <Text style={[styles.hint, doer && favor.status === 'REQUESTED' && favor.obligated && styles.warning]}>{hint}</Text> : null}

      {showPhoto && favor.hasPhoto && (
        photo.data
          ? <Image source={{ uri: photo.data.dataUrl }} style={styles.photo} resizeMode="cover"
              accessibilityLabel={t('favor.photoLabel', { title: favor.title })} />
          : <View style={[styles.photo, styles.photoLoading]}><Text style={styles.meta}>{t('common.loading')}</Text></View>
      )}

      <View style={styles.actions}>
        {doer && favor.status === 'REQUESTED' && (
          <>
            <Button compact title={t('favor.accept')} icon="checkmark" loading={action.isPending} onPress={() => run('accept')} />
            {favor.obligated
              ? <Button compact variant="ghost" title={t('favor.refuse')} onPress={() => run('refuse')} />
              : <Button compact variant="ghost" title={t('favor.decline')} onPress={() => run('decline')} />}
          </>
        )}
        {doer && favor.status === 'ACCEPTED' && (
          <Button compact title={t('favor.takePhoto')} icon="camera-outline" onPress={() => router.push(`/favor/${favor.id}`)} />
        )}
        {doer && (favor.status === 'REQUESTED' || favor.status === 'ACCEPTED') && (
          <Button compact variant="secondary" title={t('favor.openMap')} icon="map-outline" onPress={openMap} />
        )}
        {!doer && favor.status === 'SUBMITTED' && (
          <>
            <Button compact title={t('favor.approve')} icon="checkmark-done" loading={action.isPending} onPress={() => run('approve')} />
            <Button compact variant="ghost" title={t('favor.reject')} onPress={() => run('reject')} />
          </>
        )}
        {!doer && (favor.status === 'REQUESTED' || favor.status === 'ACCEPTED') && (
          <Button compact variant="ghost" title={t('card.cancel')} onPress={() => run('cancel')} />
        )}
        {canTogglePhoto && (
          <Button compact variant="secondary" icon="image-outline" onPress={() => setShowPhoto((value) => !value)}
            title={showPhoto ? t('favor.hidePhoto') : t('favor.showPhoto')} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 14, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.elevated, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 13 },
  details: { color: colors.text, fontSize: 14 },
  hint: { color: colors.muted, fontSize: 13.5 },
  warning: { color: colors.amber, fontWeight: '600' },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: colors.elevated },
  photoLoading: { alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
