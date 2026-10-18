import React, { useEffect, useRef } from 'react';

export default function MapPinPicker({ latitude, longitude, radius, onChangeCoords }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);

  useEffect(() => {
    if (!window.L || !mapContainerRef.current || mapInstanceRef.current) return;

    const startLat = parseFloat(latitude) || 45.6525;
    const startLng = parseFloat(longitude) || 25.5888;
    const startRadius = Number(radius) || 150;

    const map = window.L.map(mapContainerRef.current).setView([startLat, startLng], 15);

    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    const marker = window.L.marker([startLat, startLng], { draggable: true }).addTo(map);
    const circle = window.L.circle([startLat, startLng], {
      color: '#38bdf8',
      fillColor: '#0284c7',
      fillOpacity: 0.22,
      radius: startRadius
    }).addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      const lat = Number(pos.lat.toFixed(5));
      const lng = Number(pos.lng.toFixed(5));
      circle.setLatLng([lat, lng]);
      onChangeCoords(lat, lng);
    });

    map.on('click', (e) => {
      const lat = Number(e.latlng.lat.toFixed(5));
      const lng = Number(e.latlng.lng.toFixed(5));
      marker.setLatLng([lat, lng]);
      circle.setLatLng([lat, lng]);
      onChangeCoords(lat, lng);
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;
    circleRef.current = circle;

    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current || !markerRef.current || !circleRef.current) return;
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const rad = Number(radius) || 150;
    if (!isNaN(lat) && !isNaN(lng)) {
      markerRef.current.setLatLng([lat, lng]);
      circleRef.current.setLatLng([lat, lng]);
      circleRef.current.setRadius(rad);
      mapInstanceRef.current.panTo([lat, lng]);
    }
  }, [latitude, longitude, radius]);

  return (
    <div className="map-picker-wrapper">
      <div className="map-picker-header">
        <span>📌 Pin Drop pe Hartă: Dă click oriunde pe hartă sau trage pinul albastru pentru a seta locația activității</span>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`}
          target="_blank"
          rel="noreferrer"
          className="link-open-gmaps"
        >
          🗺️ Vezi în Google Maps
        </a>
      </div>
      <div ref={mapContainerRef} className="leaflet-map-box" />
    </div>
  );
}