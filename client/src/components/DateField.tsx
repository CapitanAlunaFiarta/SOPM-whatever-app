import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/i18n';
import { localDate, parseLocalDate } from '@/lib/dates';

import { colors, radius } from './theme';

/** Selector de dată nativ (iOS: compact; Android: dialog). Pe web: DateField.web.tsx. */
export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const { formatDate, locale } = useI18n();
  const date = parseLocalDate(value);
  const update = (selected?: Date) => {
    if (selected) onChange(localDate(0, selected));
  };

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      {Platform.OS === 'ios' ? (
        <View style={styles.iosRow}>
          <DateTimePicker value={date} mode="date" display="compact" themeVariant="dark" locale={locale}
            onChange={(_event, selected) => update(selected)} />
          <Text style={styles.hint}>{formatDate(value)}</Text>
        </View>
      ) : (
        <Pressable style={styles.input} accessibilityRole="button"
          onPress={() => DateTimePickerAndroid.open({ value: date, mode: 'date', onChange: (_event, selected) => update(selected) })}>
          <Text style={styles.value}>{value}</Text>
          <Text style={styles.hint}>{formatDate(value)}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: colors.muted, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  iosRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  input: {
    flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.input, borderColor: colors.border,
    borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13,
  },
  value: { color: colors.text, fontSize: 16 },
  hint: { color: colors.muted, fontSize: 14 },
});
