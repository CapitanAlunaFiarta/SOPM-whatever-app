import { LEAFLET_CSS, LEAFLET_JS } from './assets';

/**
 * Pagina HTML a hărții din aplicația Android: Leaflet + OpenStreetMap într-un WebView
 * (Google Maps pe Android ar cere o cheie API cu facturare). Aplicația trimite starea hărții
 * cu `window.__apply(state)`, iar pagina răspunde prin `window.ReactNativeWebView.postMessage`.
 */

export type MapPoint = { latitude: number; longitude: number };

export type MapTask = MapPoint & {
  id: number;
  title: string;
  /** Text afișat sub titlu, ex. „Activă · raza 150 m”. */
  label: string;
  radius: number;
  color: string;
};

export type MapState =
  /** preview = hartă mică într-o pagină care se derulează (detaliile unei activități): nu se trage cu degetul. */
  | { mode: 'tasks'; center: MapPoint; tasks: MapTask[]; preview?: boolean }
  | { mode: 'picker'; value: MapPoint; radius: number };

export type MapEvent = { type: 'ready' } | { type: 'pick'; latitude: number; longitude: number };

/** JSON care poate fi pus în siguranță într-un <script> (fără `</script>` și fără U+2028/U+2029). */
export function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Interpretează un mesaj venit din pagină; întoarce null pentru orice nu recunoaște. */
export function parseMapEvent(data: string): MapEvent | null {
  let message: unknown;
  try {
    message = JSON.parse(data);
  } catch {
    return null;
  }
  if (!message || typeof message !== 'object') return null;
  const { type, latitude, longitude } = message as Record<string, unknown>;
  if (type === 'ready') return { type: 'ready' };
  if (type === 'pick' && typeof latitude === 'number' && typeof longitude === 'number'
    && Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
    return { type: 'pick', latitude, longitude };
  }
  return null;
}

// Rulează în WebView (ES5, fără dependențe). Titlurile activităților sunt puse cu textContent,
// nu ca HTML, pentru că pot veni de la alți utilizatori (activități partajate).
const PAGE_SCRIPT = `
(function () {
  function post(message) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }
  var map = L.map('map', { zoomControl: true });
  map.attributionControl.setPrefix(false);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  var layer = L.layerGroup().addTo(map);
  var picker = null;
  var fitted = false;

  function pin(color) {
    var html = '<div class="pin" style="background:' + color + '"></div>';
    return L.divIcon({ className: '', html: html, iconSize: [22, 22], iconAnchor: [11, 22], popupAnchor: [0, -20] });
  }

  function popup(task) {
    var box = document.createElement('div');
    var title = document.createElement('b');
    title.textContent = task.title;
    var info = document.createElement('div');
    info.textContent = task.label;
    box.appendChild(title);
    box.appendChild(info);
    return box;
  }

  window.__apply = function (state) {
    if (state.mode === 'picker') {
      var at = [state.value.latitude, state.value.longitude];
      if (!picker) {
        var marker = L.marker(at, { draggable: true, icon: pin('#6366f1') }).addTo(map);
        var circle = L.circle(at, { color: '#38bdf8', fillColor: '#0284c7', fillOpacity: 0.22, radius: state.radius }).addTo(map);
        marker.on('dragend', function () {
          var p = marker.getLatLng();
          post({ type: 'pick', latitude: p.lat, longitude: p.lng });
        });
        map.on('click', function (event) {
          post({ type: 'pick', latitude: event.latlng.lat, longitude: event.latlng.lng });
        });
        picker = { marker: marker, circle: circle };
        map.setView(at, 16);
      } else {
        picker.marker.setLatLng(at);
        picker.circle.setLatLng(at);
        picker.circle.setRadius(state.radius);
        map.panTo(at);
      }
      return;
    }
    if (state.preview) {
      map.dragging.disable();
      map.scrollWheelZoom.disable();
      map.touchZoom.disable();
    }
    layer.clearLayers();
    var bounds = null;
    state.tasks.forEach(function (task) {
      var at = [task.latitude, task.longitude];
      // Încadrăm tot cercul razei, nu doar pinul (o rază de 1 km nu iese din hartă).
      var box = L.latLng(at).toBounds(task.radius * 2);
      bounds = bounds ? bounds.extend(box) : box;
      L.circle(at, { color: '#38bdf8', fillOpacity: 0.15, radius: task.radius }).addTo(layer);
      L.marker(at, { icon: pin(task.color) }).bindPopup(popup(task)).addTo(layer);
    });
    if (bounds) {
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 17 });
      fitted = true;
    } else if (!fitted) {
      map.setView([state.center.latitude, state.center.longitude], 13);
    }
  };
})();
`;

const PAGE_CSS = `
html, body, #map { height: 100%; margin: 0; background: #0b1220; }
.leaflet-container { font: 13px/1.4 -apple-system, Roboto, "Segoe UI", sans-serif; }
.pin { width: 22px; height: 22px; box-sizing: border-box; border-radius: 50% 50% 50% 0; border: 3px solid #fff;
  transform: rotate(-45deg); box-shadow: 0 4px 10px rgba(0, 0, 0, .45); }
`;

/** Pagina completă, cu starea inițială inclusă. */
export function buildMapPage(initial: MapState): string {
  return `<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>${LEAFLET_CSS}${PAGE_CSS}</style>
</head>
<body>
<div id="map"></div>
<script>${LEAFLET_JS}</script>
<script>${PAGE_SCRIPT}
window.__apply(${safeJson(initial)});
if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('{"type":"ready"}');
</script>
</body>
</html>`;
}
