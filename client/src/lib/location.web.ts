import type { Position } from './geo';

export { distanceMeters, type Position } from './geo';

/**
 * Pe web citim direct din browser cu `maximumAge: 0`: implementarea web din expo-location cere
 * poziția cu `maximumAge: Infinity`, adică poate întoarce o poziție veche din cache.
 */
export function currentPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Browserul nu poate citi locația.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy ?? undefined,
      }),
      (error) => reject(new Error(error.code === error.PERMISSION_DENIED
        ? 'Permite accesul la locație (din setările browserului) ca să poți confirma activitățile legate de un loc.'
        : 'Locația nu a putut fi citită. Încearcă din nou.')),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
  });
}
