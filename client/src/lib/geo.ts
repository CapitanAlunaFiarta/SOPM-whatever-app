import type { Coordinates } from './types';

export type Position = Coordinates & { accuracy?: number; mocked?: boolean };

/** Distanța aproximativă în metri (aceeași formulă ca pe server). */
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const radius = 6_371_000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
