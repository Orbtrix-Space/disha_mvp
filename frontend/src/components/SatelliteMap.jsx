import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icon issues
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ECI to approximate Lat/Lon (simplified, ignoring Earth rotation for display)
export function eciToGeodetic(x, y, z) {
  const r = Math.sqrt(x * x + y * y + z * z);
  const lat = Math.asin(z / r) * (180 / Math.PI);
  const lon = Math.atan2(y, x) * (180 / Math.PI);
  return [lat, lon];
}

function MapFollower({ position, follow }) {
  const map = useMap();
  useEffect(() => {
    if (position && follow) {
      map.panTo(position, { animate: true, duration: 0.5 });
    }
  }, [position, follow, map]);
  return null;
}

export default function SatelliteMap({ groundTrack, currentPos, velocity }) {
  const speed = velocity
    ? Math.sqrt(velocity[0] ** 2 + velocity[1] ** 2 + velocity[2] ** 2).toFixed(2)
    : '0.00';

  const altitude = currentPos
    ? (Math.sqrt(
        currentPos[0] ** 2 + currentPos[1] ** 2 + currentPos[2] ** 2
      ) - 6378.137).toFixed(1)
    : '0.0';

  const latLon = currentPos ? eciToGeodetic(currentPos[0], currentPos[1], currentPos[2]) : null;

  // Split ground track at wrap-around points (lon jumps > 180)
  const segments = useMemo(() => {
    const segs = [];
    let current = [];
    for (let i = 0; i < groundTrack.length; i++) {
      if (current.length > 0) {
        const prev = current[current.length - 1];
        if (Math.abs(groundTrack[i][1] - prev[1]) > 180) {
          segs.push(current);
          current = [];
        }
      }
      current.push(groundTrack[i]);
    }
    if (current.length > 0) segs.push(current);
    return segs;
  }, [groundTrack]);

  return (
    <div className="map-panel">
      {/* Overlay stats */}
      <div className="map-overlay-stats">
        <div className="map-stat-chip">
          ALT <span className="value">{altitude} km</span>
        </div>
        <div className="map-stat-chip">
          VEL <span className="value">{speed} km/s</span>
        </div>
      </div>

      {/* Orbit info at bottom */}
      {latLon && (
        <div className="orbit-info-overlay">
          <div className="orbit-stat">
            <div className="orbit-stat-label">Latitude</div>
            <div className="orbit-stat-value">{latLon[0].toFixed(4)}</div>
          </div>
          <div className="orbit-stat">
            <div className="orbit-stat-label">Longitude</div>
            <div className="orbit-stat-value">{latLon[1].toFixed(4)}</div>
          </div>
        </div>
      )}

      <MapContainer
        center={[20, 78]}
        zoom={3}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          maxZoom={18}
        />

        {/* Ground track segments */}
        {segments.map((seg, i) => (
          <Polyline
            key={i}
            positions={seg}
            pathOptions={{
              color: '#0ea5e9',
              weight: 2,
              opacity: 0.6,
              dashArray: '6 4',
            }}
          />
        ))}

        {/* Recent trail (brighter) */}
        {groundTrack.length > 2 && (
          <Polyline
            positions={groundTrack.slice(-15)}
            pathOptions={{
              color: '#22d3ee',
              weight: 3,
              opacity: 0.9,
            }}
          />
        )}

        {/* Satellite position */}
        {latLon && (
          <CircleMarker
            center={latLon}
            radius={7}
            pathOptions={{
              color: '#22d3ee',
              fillColor: '#22d3ee',
              fillOpacity: 1,
              weight: 2,
            }}
          >
            <Tooltip permanent direction="top" offset={[0, -12]} className="sat-tooltip">
              <span style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.7rem',
                color: '#0ea5e9',
                fontWeight: 600,
              }}>
                DISHA-SAT-01
              </span>
            </Tooltip>
          </CircleMarker>
        )}

        {/* Glow ring around satellite */}
        {latLon && (
          <CircleMarker
            center={latLon}
            radius={18}
            pathOptions={{
              color: '#22d3ee',
              fillColor: '#22d3ee',
              fillOpacity: 0.08,
              weight: 1,
              opacity: 0.3,
            }}
          />
        )}

        <MapFollower position={latLon} follow={true} />
      </MapContainer>
    </div>
  );
}
