import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useRef } from 'react';

import { useI18n } from '@/i18n';
import type { Coordinates, Task } from '@/lib/types';

import { pinIcon } from './LocationPicker.web';
import { colors } from './theme';

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));
}

/** Harta activităților cu locație în browser (Leaflet). */
export function TasksMap({ tasks, center, minHeight = 360, preview }: {
  tasks: Task[]; center: Coordinates; onSelect?: (task: Task) => void; minHeight?: number;
  /** Hartă mică într-o pagină care se derulează: rotița mouse-ului derulează pagina, nu face zoom. */
  preview?: boolean;
}) {
  const { t } = useI18n();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!container.current || map.current) return undefined;
    const instance = L.map(container.current, { scrollWheelZoom: !preview, dragging: !(preview && L.Browser.mobile) })
      .setView([center.latitude, center.longitude], 13);
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
    let bounds: L.LatLngBounds | null = null;
    for (const task of tasks) {
      const position: L.LatLngExpression = [task.latitude, task.longitude];
      // Încadrăm tot cercul razei, nu doar pinul.
      const box = L.latLng(position).toBounds(task.radius * 2);
      bounds = bounds ? bounds.extend(box) : box;
      L.circle(position, { color: colors.cyan, fillOpacity: 0.15, radius: task.radius }).addTo(group);
      L.marker(position, { icon: pinIcon })
        .bindPopup(`<b>${escapeHtml(task.title)}</b><br/>${escapeHtml(t('map.taskLabel', {
          status: t(`status.${task.status}`), radius: task.radius,
        }))}`)
        .addTo(group);
    }
    if (bounds) map.current.fitBounds(bounds, { padding: [28, 28], maxZoom: 17 });
  }, [tasks, t]);

  return <div ref={container} style={{ flex: 1, minHeight, borderRadius: 16, overflow: 'hidden', border: `1px solid ${colors.border}`, zIndex: 0 }} />;
}
