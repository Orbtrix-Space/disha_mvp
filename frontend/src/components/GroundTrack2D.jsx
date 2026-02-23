import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../services/api';

const STATION_COLORS = {
  'ISTRAC Bangalore': '#00d4ff',
  'ISRO Lucknow': '#00ff88',
  'Svalbard SvalSat': '#ff6b35',
  'KSAT Tromso': '#ffd700',
  'NASA Wallops': '#ff4081',
};

export default function GroundTrack2D({ telemetry }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const satMarkerRef = useRef(null);
  const trailLineRef = useRef(null);
  const trailRef = useRef([]);
  const stationsAddedRef = useRef(false);

  // Initialize Leaflet map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [0, 0],
      zoom: 4,
      zoomControl: false,
      attributionControl: false,
      minZoom: 2,
      maxZoom: 12,
    });

    // CartoDB Dark Matter tiles (free, dark theme)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    // Satellite marker (pulsing cyan dot)
    const satIcon = L.divIcon({
      className: 'sat-marker-2d',
      html: `<div class="sat-dot-outer"><div class="sat-dot-inner"></div></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    satMarkerRef.current = L.marker([0, 0], { icon: satIcon }).addTo(map);

    // Ground track trail polyline
    trailLineRef.current = L.polyline([], {
      color: '#22d3ee',
      weight: 2,
      opacity: 0.5,
      dashArray: '6, 4',
    }).addTo(map);

    // Zoom control in bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    mapRef.current = map;

    // Add ground stations
    if (!stationsAddedRef.current) {
      stationsAddedRef.current = true;
      api.getGroundStations().then((data) => {
        if (!data || !data.stations || !mapRef.current) return;
        data.stations.forEach((gs) => {
          const color = STATION_COLORS[gs.name] || '#888';
          const gsIcon = L.divIcon({
            className: 'gs-marker-2d',
            html: `<div style="width:8px;height:8px;border-radius:50%;background:${color};box-shadow:0 0 6px ${color};"></div>`,
            iconSize: [8, 8],
            iconAnchor: [4, 4],
          });
          L.marker([gs.latitude, gs.longitude], { icon: gsIcon })
            .bindTooltip(gs.name, {
              permanent: false,
              direction: 'top',
              className: 'gs-tooltip-2d',
              offset: [0, -6],
            })
            .addTo(mapRef.current);

          // Range circle (~1500km rough visibility)
          L.circle([gs.latitude, gs.longitude], {
            radius: 1500000,
            color: color,
            weight: 0.5,
            opacity: 0.2,
            fill: true,
            fillColor: color,
            fillOpacity: 0.03,
          }).addTo(mapRef.current);
        });
      });
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update satellite position and trail
  useEffect(() => {
    if (!telemetry || !mapRef.current || !satMarkerRef.current) return;

    const { latitude, longitude } = telemetry;
    const latLng = [latitude, longitude];

    // Update marker
    satMarkerRef.current.setLatLng(latLng);

    // Pan map to follow satellite (smooth)
    mapRef.current.panTo(latLng, { animate: true, duration: 0.5 });

    // Update trail
    const trail = trailRef.current;
    const last = trail[trail.length - 1];
    if (!last || last[0] !== latitude || last[1] !== longitude) {
      trail.push(latLng);
      if (trail.length > 120) trail.shift();

      // Split trail at anti-meridian wraps to avoid cross-world lines
      if (trailLineRef.current) {
        const segments = [[]];
        for (let i = 0; i < trail.length; i++) {
          segments[segments.length - 1].push(trail[i]);
          if (i < trail.length - 1 && Math.abs(trail[i][1] - trail[i + 1][1]) > 180) {
            segments.push([]);
          }
        }
        trailLineRef.current.setLatLngs(segments);
      }
    }
  }, [telemetry]);

  // Handle container resize
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (mapRef.current) mapRef.current.invalidateSize();
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="ground-track-panel">
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
