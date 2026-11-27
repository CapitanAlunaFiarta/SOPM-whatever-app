import { Text, View } from 'react-native';

import { useI18n } from '@/i18n';

import { colors } from './theme';

/** Selector de dată în browser (input type="date"). */
export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const { formatDate, language } = useI18n();
  return (
    <View>
      <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <input type="date" aria-label={label} lang={language} value={value} required onChange={(event) => event.target.value && onChange(event.target.value)}
          style={{
            background: colors.input, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 12,
            padding: '11px 14px', fontSize: 16, colorScheme: 'dark', fontFamily: 'inherit',
          }} />
        <Text style={{ color: colors.muted, fontSize: 14 }}>{formatDate(value)}</Text>
      </View>
    </View>
  );
}
