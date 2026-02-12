import { Activity, Battery, Database, Navigation, Gauge } from 'lucide-react';
import { eciToGeodetic } from './SatelliteMap';

function ProgressBar({ value, colorClass }) {
  return (
    <div className="progress-bar-container">
      <div
        className={`progress-bar-fill ${colorClass}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function getBatteryColor(pct) {
  if (pct > 60) return 'green';
  if (pct > 30) return 'yellow';
  return 'red';
}

export default function Telemetry({ status }) {
  if (!status) {
    return (
      <div className="sidebar">
        <div className="sidebar-section">
          <div className="empty-state">
            <Activity />
            <div className="empty-state-title">Awaiting Telemetry</div>
            <div className="empty-state-desc">
              Connecting to DISHA-SAT-01...
            </div>
          </div>
        </div>
      </div>
    );
  }

  const batteryColor = getBatteryColor(status.battery_pct);
  const speed = Math.sqrt(
    status.velocity[0] ** 2 + status.velocity[1] ** 2 + status.velocity[2] ** 2
  );
  const altitude =
    Math.sqrt(
      status.position[0] ** 2 +
        status.position[1] ** 2 +
        status.position[2] ** 2
    ) - 6378.137;
  const [lat, lon] = eciToGeodetic(
    status.position[0],
    status.position[1],
    status.position[2]
  );

  return (
    <div className="sidebar">
      {/* Power */}
      <div className="sidebar-section">
        <div className="section-header">
          <div className="section-title">
            <Battery size={14} /> Power System
          </div>
        </div>
        <div className="telemetry-grid">
          <div className="telem-card full-width">
            <div className="telem-label">Battery Level</div>
            <div className={`telem-value ${batteryColor}`}>
              {status.battery_pct}
              <span className="telem-unit">%</span>
            </div>
            <ProgressBar value={status.battery_pct} colorClass={batteryColor} />
            <div
              style={{
                marginTop: 6,
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                color: 'var(--text-muted)',
              }}
            >
              {status.battery_wh} / {status.max_battery_wh} Wh
            </div>
          </div>
        </div>
      </div>

      {/* Storage */}
      <div className="sidebar-section">
        <div className="section-header">
          <div className="section-title">
            <Database size={14} /> Data Storage
          </div>
        </div>
        <div className="telemetry-grid">
          <div className="telem-card full-width">
            <div className="telem-label">Storage Used</div>
            <div className="telem-value cyan">
              {status.storage_pct}
              <span className="telem-unit">%</span>
            </div>
            <ProgressBar value={status.storage_pct} colorClass="blue" />
            <div
              style={{
                marginTop: 6,
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                color: 'var(--text-muted)',
              }}
            >
              {status.storage_used_gb} / {status.max_storage_gb} GB
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="sidebar-section">
        <div className="section-header">
          <div className="section-title">
            <Navigation size={14} /> Navigation
          </div>
        </div>
        <div className="telemetry-grid">
          <div className="telem-card">
            <div className="telem-label">Latitude</div>
            <div className="telem-value cyan" style={{ fontSize: '1.1rem' }}>
              {lat.toFixed(4)}°
            </div>
          </div>
          <div className="telem-card">
            <div className="telem-label">Longitude</div>
            <div className="telem-value cyan" style={{ fontSize: '1.1rem' }}>
              {lon.toFixed(4)}°
            </div>
          </div>
          <div className="telem-card">
            <div className="telem-label">Altitude</div>
            <div className="telem-value purple" style={{ fontSize: '1.1rem' }}>
              {altitude.toFixed(1)}
              <span className="telem-unit">km</span>
            </div>
          </div>
          <div className="telem-card">
            <div className="telem-label">Velocity</div>
            <div className="telem-value purple" style={{ fontSize: '1.1rem' }}>
              {speed.toFixed(2)}
              <span className="telem-unit">km/s</span>
            </div>
          </div>
        </div>
      </div>

      {/* ECI State (raw) */}
      <div className="sidebar-section" style={{ flex: 1, overflow: 'auto' }}>
        <div className="section-header">
          <div className="section-title">
            <Gauge size={14} /> ECI State Vector
          </div>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.7rem',
            color: 'var(--text-muted)',
            lineHeight: 1.8,
          }}
        >
          <div>
            <span style={{ color: 'var(--text-secondary)' }}>Rx</span>{' '}
            <span style={{ color: 'var(--accent-cyan)' }}>
              {status.position[0].toFixed(3)}
            </span>{' '}
            km
          </div>
          <div>
            <span style={{ color: 'var(--text-secondary)' }}>Ry</span>{' '}
            <span style={{ color: 'var(--accent-cyan)' }}>
              {status.position[1].toFixed(3)}
            </span>{' '}
            km
          </div>
          <div>
            <span style={{ color: 'var(--text-secondary)' }}>Rz</span>{' '}
            <span style={{ color: 'var(--accent-cyan)' }}>
              {status.position[2].toFixed(3)}
            </span>{' '}
            km
          </div>
          <div style={{ marginTop: 8 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Vx</span>{' '}
            <span style={{ color: 'var(--accent-purple)' }}>
              {status.velocity[0].toFixed(5)}
            </span>{' '}
            km/s
          </div>
          <div>
            <span style={{ color: 'var(--text-secondary)' }}>Vy</span>{' '}
            <span style={{ color: 'var(--accent-purple)' }}>
              {status.velocity[1].toFixed(5)}
            </span>{' '}
            km/s
          </div>
          <div>
            <span style={{ color: 'var(--text-secondary)' }}>Vz</span>{' '}
            <span style={{ color: 'var(--accent-purple)' }}>
              {status.velocity[2].toFixed(5)}
            </span>{' '}
            km/s
          </div>
          <div style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: '0.65rem' }}>
            Last Update: {new Date(status.timestamp).toLocaleTimeString()}
          </div>
        </div>
      </div>
    </div>
  );
}
