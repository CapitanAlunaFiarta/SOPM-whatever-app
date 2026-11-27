import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useRef } from 'react';

import { STATUS_LABELS, type Coordinates, type Task } from '@/lib/types';

import { pinIcon } from './LocationPicker.web';
import { colors } from './theme';

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));
}

/** Harta activităților cu locație în browser (Leaflet). */
export function TasksMap({ tasks, center }: { tasks: Task[]; center: Coordinates; onSelect?: (task: Task) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!container.current || map.current) return undefined;
    const instance = L.map(container.current).setView([center.latitude, center.longitude], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(instance);
    layer.current = L.layerGroup().addTo(instance);
    map.current = instance;
    const timer = setTimeout(() => instance.invalidateSize(), 150);
    return () => {
      clearTimeout(timer);
      instance.remove();
      map.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const group = layer.current;
    if (!group || !map.current) return;
    group.clearLayers();
    const bounds: L.LatLngExpression[] = [];
    tasks.forEach((task) => {
      const position: L.LatLngExpression = [task.latitude, task.longitude];
      bounds.push(position);
      L.circle(position, { color: colors.cyan, fillOpacity: 0.15, radius: task.radius }).addTo(group);
      L.marker(position, { icon: pinIcon })
        .bindPopup(`<b>${escapeHtml(task.title)}</b><br/>${STATUS_LABELS[task.status]} · raza ${task.radius} m`)
        .addTo(group);
    });
    if (bounds.length > 0) map.current.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 16 });
  }, [tasks]);

  return <div ref={container} style={{ flex: 1, minHeight: 360, borderRadius: 16, overflow: 'hidden', border: `1px solid ${colors.border}`, zIndex: 0 }} />;
}
