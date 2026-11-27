import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LANGUAGE_NAMES, LANGUAGES, useI18n } from '@/i18n';

import { colors, radius } from './theme';
import { Segmented } from './ui';

/**
 * Alegerea limbii. Varianta compactă (RO · EN · ES) e pe ecranele de autentificare,
 * cea completă în Profil. Alegerea se salvează pe dispozitiv.
 */
export function LanguagePicker({ compact }: { compact?: boolean }) {
  const { language, setLanguage, t } = useI18n();

  if (!compact) {
    return (
      <Segmented value={language} onChange={setLanguage}
        options={LANGUAGES.map((code) => ({ value: code, label: LANGUAGE_NAMES[code] }))} />
    );
  }

  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={t('language.title')}>
      {LANGUAGES.map((code) => {
        const selected = code === language;
        return (
          <Pressable key={code} onPress={() => setLanguage(code)} accessibilityRole="radio"
            accessibilityLabel={LANGUAGE_NAMES[code]} accessibilityState={{ selected, checked: selected }}
            hitSlop={6} style={[styles.option, selected && styles.selected]}>
            <Text style={[styles.code, selected && styles.codeSelected]}>{code.toUpperCase()}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  option: { paddingVertical: 5, paddingHorizontal: 11, borderRadius: radius.sm, borderWidth: 1, borderColor: 'transparent' },
  selected: { borderColor: colors.border, backgroundColor: colors.elevated },
  code: { color: colors.faint, fontWeight: '800', fontSize: 13, letterSpacing: 1 },
  codeSelected: { color: colors.text },
});
