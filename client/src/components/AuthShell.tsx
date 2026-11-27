import type { ReactNode } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useI18n } from '@/i18n';

import { LanguagePicker } from './LanguagePicker';
import { colors } from './theme';

/** Cadrul ecranelor de autentificare: logo + card centrat + alegerea limbii. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.inner}>
            <View style={styles.brand}>
              <Image source={require('@/assets/images/logo.png')} style={styles.logo} />
              <Text style={styles.name}>WHATEVER</Text>
              <Text style={styles.tagline}>{t('auth.tagline')}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              {children}
            </View>
            <LanguagePicker compact />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  inner: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: 22 },
  brand: { alignItems: 'center', gap: 6 },
  logo: { width: 72, height: 72, borderRadius: 18 },
  name: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: 2 },
  tagline: { color: colors.muted, fontSize: 14 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 20, padding: 20, gap: 14 },
  title: { color: colors.text, fontSize: 21, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: -6 },
});
