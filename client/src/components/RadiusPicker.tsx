import { useState } from 'react';
import { View } from 'react-native';

import { useI18n } from '@/i18n';

import { ChipGroup, TextField } from './ui';

/** Limitele razei, aceleași ca pe server. */
export const RADIUS_MIN = 10;
export const RADIUS_MAX = 10_000;
export const isValidRadius = (value: number) => Number.isInteger(value) && value >= RADIUS_MIN && value <= RADIUS_MAX;

const CUSTOM = 'custom';

/**
 * Raza în metri: una dintre valorile obișnuite sau „Altă rază”, scrisă de mână (10–10000 m).
 * O valoare scrisă greșit ajunge în formular ca NaN/în afara limitelor, iar formularul o refuză la salvare.
 */
export function RadiusPicker({ value, onChange, presets }: {
  value: number; onChange: (value: number) => void; presets: readonly number[];
}) {
  const { t } = useI18n();
  const [custom, setCustom] = useState(() => !presets.includes(value));
  const [text, setText] = useState(() => (presets.includes(value) ? '' : String(value)));
  const options = [...presets.map(String), CUSTOM];
  const invalid = custom && text !== '' && !isValidRadius(Number(text));

  return (
    <View style={{ gap: 8 }}>
      <ChipGroup options={options} value={custom ? CUSTOM : String(value)} labels={{ [CUSTOM]: t('form.radiusCustom') }}
        onChange={(option) => {
          if (option === CUSTOM) {
            setCustom(true);
            setText(String(value));
            return;
          }
          setCustom(false);
          onChange(Number(option));
        }} />
      {custom && (
        <TextField value={text} keyboardType="number-pad" inputMode="numeric" maxLength={5}
          placeholder={t('form.radiusPlaceholder')} accessibilityLabel={t('form.radiusCustomLabel')}
          error={invalid ? t('form.radiusInvalid') : undefined}
          onChangeText={(raw) => {
            const digits = raw.replace(/\D/g, '');
            setText(digits);
            onChange(digits ? Number(digits) : Number.NaN);
          }} />
      )}
    </View>
  );
}
