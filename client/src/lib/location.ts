import * as Location from 'expo-location';

import type { Position } from './geo';

export { distanceMeters, type Position } from './geo';

/** Poziția curentă, proaspătă (nu cea de la deschiderea ecranului), pe iOS și Android. */
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
