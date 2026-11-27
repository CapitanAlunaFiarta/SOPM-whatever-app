import { StyleSheet, View } from 'react-native';

import type { Coordinates } from '@/lib/types';

import { LeafletMap } from './leaflet/LeafletMap';
import { colors, radius as corner } from './theme';

const round = (value: number) => Number(value.toFixed(6));

/**
 * Alegerea locației pe Android: atingi harta sau tragi pinul (Leaflet + OpenStreetMap într-un
 * WebView, fără cheie Google Maps). iOS: LocationPicker.ios.tsx, web: LocationPicker.web.tsx.
 */
export function LocationPicker({ value, radius, onChange }: {
  value: Coordinates;
  radius: number;
  onChange: (value: Coordinates) => void;
}) {
  return (
    <View style={styles.wrapper}>
      <LeafletMap
        style={StyleSheet.absoluteFill}
        state={{ mode: 'picker', value: { latitude: value.latitude, longitude: value.longitude }, radius }}
        onEvent={(event) => {
          if (event.type === 'pick') onChange({ latitude: round(event.latitude), longitude: round(event.longitude) });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { height: 260, borderRadius: corner.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
});
