import { Text, View } from 'react-native';

import { friendlyDate } from '@/lib/dates';

import { colors } from './theme';

/** Selector de dată în browser (input type="date"). */
export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <View>
      <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <input type="date" value={value} required onChange={(event) => event.target.value && onChange(event.target.value)}
          style={{
            background: colors.input, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: 12,
            padding: '11px 14px', fontSize: 16, colorScheme: 'dark', fontFamily: 'inherit',
          }} />
        <Text style={{ color: colors.muted, fontSize: 14 }}>{friendlyDate(value)}</Text>
      </View>
    </View>
  );
}
