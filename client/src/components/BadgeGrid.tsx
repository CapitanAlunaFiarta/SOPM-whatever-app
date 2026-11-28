import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/i18n';
import { showMessage } from '@/lib/dialogs';
import type { BadgeId, BadgeProgress } from '@/lib/types';

import { colors, radius } from './theme';
import { AppText, Card, Row, type IconName } from './ui';

const ICONS: Record<BadgeId, IconName> = {
  FIRST_STEP: 'footsteps-outline',
  STREAK_3: 'flame-outline',
  DONE_10: 'checkmark-done-outline',
  STREAK_7: 'flame',
  FRIENDS_5: 'people-outline',
  HELPER: 'hand-left-outline',
  TEAM_PLAYER: 'people-circle-outline',
  SPORT_10: 'barbell-outline',
  STUDY_10: 'school-outline',
  CHORES_10: 'home-outline',
  FUN_10: 'game-controller-outline',
  EARLY_BIRD: 'sunny-outline',
  NIGHT_OWL: 'moon-outline',
  REGULAR: 'repeat-outline',
  ORGANIZER: 'megaphone-outline',
  DONE_50: 'ribbon-outline',
  STREAK_30: 'bonfire-outline',
  DONE_100: 'trophy-outline',
};

/** Culoarea după cât de greu e pragul: ușoare (albastru), medii (violet), grele (chihlimbar). */
function tierColor(goal: number): string {
  if (goal >= 30) return colors.amber;
  if (goal >= 10) return colors.violet;
  return colors.cyan;
}

/**
 * Insignele unui profil. Pe profilul meu apar toate (cele necâștigate în gri, cu progresul); pe al altcuiva,
 * doar cele câștigate. Apăsarea pe o insignă arată ce trebuie făcut pentru ea.
 */
export function BadgeGrid({ badges, showLocked }: { badges: BadgeProgress[]; showLocked: boolean }) {
  const { t } = useI18n();
  const known = badges.filter((badge) => badge.id in ICONS);
  const earned = known.filter((badge) => badge.earned).length;
  const visible = showLocked ? known : known.filter((badge) => badge.earned);
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row gap={8}>
          <Ionicons name="medal-outline" size={18} color={colors.amber} />
          <AppText variant="heading">{t('badges.title')}</AppText>
        </Row>
        <AppText variant="small">{t('badges.count', { earned, total: known.length })}</AppText>
      </Row>
      {visible.length === 0 ? <AppText variant="muted">{t('badges.none')}</AppText> : (
        <View style={styles.grid}>
          {visible.map((badge) => {
            const name = t(`badge.${badge.id}`);
            const hint = t(`badgeHint.${badge.id}`);
            const color = badge.earned ? tierColor(badge.goal) : colors.faint;
            return (
              <Pressable key={badge.id} accessibilityRole="button"
                accessibilityLabel={`${name}: ${badge.earned ? t('badges.earned') : t('badges.progress', { progress: badge.progress, goal: badge.goal })}`}
                onPress={() => showMessage(name, `${hint}\n\n${badge.earned ? t('badges.earned')
                  : t('badges.progress', { progress: badge.progress, goal: badge.goal })}`)}
                style={({ pressed }) => [styles.badge, pressed && { opacity: 0.7 }]}>
                <View style={[styles.icon, { borderColor: color, backgroundColor: badge.earned ? `${color}26` : colors.elevated }]}>
                  <Ionicons name={ICONS[badge.id]} size={22} color={color} />
                </View>
                <Text style={[styles.name, !badge.earned && { color: colors.muted }]} numberOfLines={2}>{name}</Text>
                {!badge.earned ? (
                  <View style={styles.track} accessible={false}>
                    <View style={[styles.fill, { width: `${Math.round((badge.progress / badge.goal) * 100)}%` }]} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badge: {
    width: '30%', minWidth: 92, flexGrow: 1, alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 6,
    borderRadius: radius.md, backgroundColor: colors.input,
  },
  icon: { width: 46, height: 46, borderRadius: 23, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.text, fontSize: 12.5, fontWeight: '700', textAlign: 'center' },
  track: { width: '80%', height: 4, borderRadius: 2, backgroundColor: colors.elevated, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.muted },
});
