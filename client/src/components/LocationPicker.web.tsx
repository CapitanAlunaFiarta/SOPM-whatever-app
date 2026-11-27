import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useEffectEvent, useRef } from 'react';

import type { Coordinates } from '@/lib/types';

import { colors } from './theme';

export const pinIcon = L.divIcon({
  className: 'whatever-pin',
  html: `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:${colors.indigo};border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 4px 10px rgba(0,0,0,.45)"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

/** Alegerea locației pe hartă în browser (Leaflet + OpenStreetMap). */
export function LocationPicker({ value, radius, onChange }: {
  value: Coordinates;
  radius: number;
  onChange: (value: Coordinates) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const circle = useRef<L.Circle | null>(null);
  // Apelat din handlerele Leaflet; vede mereu ultima versiune a lui onChange fără a recrea harta.
  const emit = useEffectEvent((lat: number, lng: number) => {
    onChange({ latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)) });
  });

  useEffect(() => {
    if (!container.current || map.current) return undefined;
    const instance = L.map(container.current).setView([value.latitude, value.longitude], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(instance);
    const pin = L.marker([value.latitude, value.longitude], { draggable: true, icon: pinIcon }).addTo(instance);
    const area = L.circle([value.latitude, value.longitude], { color: colors.cyan, fillColor: '#0284c7', fillOpacity: 0.22, radius }).addTo(instance);
    pin.on('dragend', () => {
      const position = pin.getLatLng();
      emit(position.lat, position.lng);
    });
    instance.on('click', (event: L.LeafletMouseEvent) => emit(event.latlng.lat, event.latlng.lng));
    map.current = instance;
    marker.current = pin;
    circle.current = area;
    const timer = setTimeout(() => instance.invalidateSize(), 150);
    return () => {
      clearTimeout(timer);
      instance.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const position: L.LatLngExpression = [value.latitude, value.longitude];
    marker.current?.setLatLng(position);
    circle.current?.setLatLng(position);
    circle.current?.setRadius(radius);
    map.current?.panTo(position);
  }, [value.latitude, value.longitude, radius]);

  return (
    <div ref={container}
      style={{ height: 280, borderRadius: 12, overflow: 'hidden', border: `1px solid ${colors.border}`, zIndex: 0 }} />
  );
}
