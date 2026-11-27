import * as Location from 'expo-location';

import type { Coordinates } from './types';

export type Position = Coordinates & { accuracy?: number; mocked?: boolean };

/** Poziția curentă, proaspătă (nu cea de la deschiderea ecranului). Merge pe iOS, Android și web. */
export async function currentPosition(): Promise<Position> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error('Permite accesul la locație ca să poți confirma activitățile legate de un loc.');
  }
  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy ?? undefined,
      mocked: position.mocked ?? undefined,
    };
  } catch {
    throw new Error('Locația nu a putut fi citită. Activează GPS-ul și încearcă din nou.');
  }
}

/** Distanța aproximativă în metri (aceeași formulă ca pe server). */
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const radius = 6_371_000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
