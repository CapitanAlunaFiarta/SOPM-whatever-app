import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors } from './theme';

/**
 * Cerc de progres (procent completat). `percent = null` înseamnă „nimic de măsurat”: cercul rămâne gol
 * și în mijloc apare o liniuță. Același desen SVG pe Android, iOS și web.
 */
export function ProgressRing({ percent, label, center, size = 116, stroke = 11 }: {
  percent: number | null;
  /** Textul citit de cititorul de ecran. */
  label: string;
  /** Textul din mijloc (implicit procentul), ex. timpul rămas al unei sesiuni de focus. */
  center?: string;
  size?: number;
  stroke?: number;
}) {
  const value = percent === null ? 0 : Math.max(0, Math.min(100, Math.round(percent)));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = value >= 100 ? colors.green : colors.cyan;

  return (
    <View style={{ width: size, height: size }} accessible role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      {/* Rotim desenul ca arcul să pornească de sus (ora 12), în sensul acelor de ceasornic. */}
      <View style={{ transform: [{ rotate: '-90deg' }] }}>
        <Svg width={size} height={size}>
          {/* Pista: aceeași nuanță ca arcul, mult mai stinsă; gri când nu e nimic de măsurat. */}
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={percent === null ? colors.border : `${color}33`}
            strokeWidth={stroke} fill="none" />
          {value > 0 && (
            <Circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={stroke} fill="none"
              strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={circumference * (1 - value / 100)} />
          )}
        </Svg>
      </View>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text style={[styles.value, { color: percent === null ? colors.faint : colors.text }]}>
          {center ?? (percent === null ? '–' : `${value}%`)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' },
  value: { fontSize: 24, fontWeight: '900' },
});
