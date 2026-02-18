import { Activity, Battery, Database, Navigation, Gauge, Thermometer, Zap } from 'lucide-react';

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

export default function Telemetry({ telemetry }) {
  if (!telemetry) {
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

  const batteryColor = getBatteryColor(telemetry.battery_pct);

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
              {telemetry.battery_pct}
              <span className="telem-unit">%</span>
            </div>
            <ProgressBar value={telemetry.battery_pct} colorClass={batteryColor} />
            <div
              style={{
                marginTop: 6,
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                color: 'var(--text-muted)',
              }}
            >
              {telemetry.battery_wh} / {telemetry.max_battery_wh} Wh
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
              {telemetry.storage_pct}
              <span className="telem-unit">%</span>
            </div>
            <ProgressBar value={telemetry.storage_pct} colorClass="blue" />
            <div
              style={{
                marginTop: 6,
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                color: 'var(--text-muted)',
              }}
            >
              {telemetry.storage_used_gb} / {telemetry.max_storage_gb} GB
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
              {telemetry.latitude.toFixed(4)}°
            </div>
          </div>
          <div className="telem-card">
            <div className="telem-label">Longitude</div>
            <div className="telem-value cyan" style={{ fontSize: '1.1rem' }}>
              {telemetry.longitude.toFixed(4)}°
            </div>
          </div>
          <div className="telem-card">
            <div className="telem-label">Altitude</div>
            <div className="telem-value purple" style={{ fontSize: '1.1rem' }}>
              {telemetry.altitude_km.toFixed(1)}
              <span className="telem-unit">km</span>
            </div>
          </div>
          <div className="telem-card">
            <div className="telem-label">Velocity</div>
            <div className="telem-value purple" style={{ fontSize: '1.1rem' }}>
              {telemetry.speed_km_s.toFixed(2)}
              <span className="telem-unit">km/s</span>
            </div>
          </div>
        </div>
      </div>

      {/* Subsystems */}
      <div className="sidebar-section">
        <div className="section-header">
          <div className="section-title">
            <Thermometer size={14} /> Subsystems
          </div>
        </div>
        <div className="telemetry-grid">
          <div className="telem-card">
            <div className="telem-label">Temp</div>
            <div className="telem-value green" style={{ fontSize: '1.1rem' }}>
              {telemetry.temperature_c}
              <span className="telem-unit">°C</span>
            </div>
          </div>
          <div className="telem-card">
            <div className="telem-label">Solar</div>
            <div className="telem-value yellow" style={{ fontSize: '1.1rem' }}>
              {telemetry.solar_panel_current_a}
              <span className="telem-unit">A</span>
            </div>
          </div>
          <div className="telem-card full-width">
            <div className="telem-label">Mode</div>
            <div className="telem-value green" style={{ fontSize: '0.9rem' }}>
              <Zap size={12} style={{ display: 'inline', marginRight: 4 }} />
              {telemetry.mode}
            </div>
          </div>
        </div>
      </div>

      {/* ECI State */}
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
              {telemetry.position_eci[0].toFixed(3)}
            </span>{' '}
            km
          </div>
          <div>
            <span style={{ color: 'var(--text-secondary)' }}>Ry</span>{' '}
            <span style={{ color: 'var(--accent-cyan)' }}>
              {telemetry.position_eci[1].toFixed(3)}
            </span>{' '}
            km
          </div>
          <div>
            <span style={{ color: 'var(--text-secondary)' }}>Rz</span>{' '}
            <span style={{ color: 'var(--accent-cyan)' }}>
              {telemetry.position_eci[2].toFixed(3)}
            </span>{' '}
            km
          </div>
          <div style={{ marginTop: 8 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Vx</span>{' '}
            <span style={{ color: 'var(--accent-purple)' }}>
              {telemetry.velocity_eci[0].toFixed(5)}
            </span>{' '}
            km/s
          </div>
          <div>
            <span style={{ color: 'var(--text-secondary)' }}>Vy</span>{' '}
            <span style={{ color: 'var(--accent-purple)' }}>
              {telemetry.velocity_eci[1].toFixed(5)}
            </span>{' '}
            km/s
          </div>
          <div>
            <span style={{ color: 'var(--text-secondary)' }}>Vz</span>{' '}
            <span style={{ color: 'var(--accent-purple)' }}>
              {telemetry.velocity_eci[2].toFixed(5)}
            </span>{' '}
            km/s
          </div>
          <div style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: '0.65rem' }}>
            {new Date(telemetry.timestamp).toLocaleTimeString()} UTC
          </div>
        </div>
      </div>
    </div>
  );
}
