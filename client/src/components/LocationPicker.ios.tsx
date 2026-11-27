import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';

import type { Coordinates } from '@/lib/types';

import { colors, radius as corner } from './theme';

/** Alegerea locației pe iOS (Apple Maps): atingi harta sau tragi pinul. Android: LocationPicker.tsx, web: LocationPicker.web.tsx. */
export function LocationPicker({ value, radius, onChange }: {
  value: Coordinates;
  radius: number;
  onChange: (value: Coordinates) => void;
}) {
  const map = useRef<MapView>(null);

  useEffect(() => {
    map.current?.animateToRegion({ ...value, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 300);
  }, [value.latitude, value.longitude]); // eslint-disable-line react-hooks/exhaustive-deps


  return (
    <View style={styles.wrapper}>
      <MapView
        ref={map}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...value, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
        onPress={(event) => onChange(event.nativeEvent.coordinate)}
        showsUserLocation>
        <Marker coordinate={value} draggable onDragEnd={(event) => onChange(event.nativeEvent.coordinate)} />
        <Circle center={value} radius={radius} strokeColor={colors.cyan} fillColor="rgba(56,189,248,0.18)" />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { height: 260, borderRadius: corner.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
});
