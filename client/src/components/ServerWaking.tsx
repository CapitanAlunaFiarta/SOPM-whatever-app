import { useSyncExternalStore } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/i18n';
import { isWaitingForServer, subscribeWaitingForServer } from '@/lib/api';

import { colors, radius } from './theme';

/** Mesaj discret, sus, cât timp serverul (care doarme după o pauză) întârzie să răspundă. */
export function ServerWaking() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const waiting = useSyncExternalStore(subscribeWaitingForServer, isWaitingForServer, () => false);
  if (!waiting) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <ActivityIndicator size="small" color={colors.cyan} />
        <Text style={styles.text}>{t('server.waking')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 12, zIndex: 1000 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 520, paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: radius.lg, backgroundColor: colors.elevated, borderWidth: 1, borderColor: `${colors.cyan}66`,
  },
  text: { color: colors.text, fontWeight: '600', flexShrink: 1, fontSize: 13.5 },
});
