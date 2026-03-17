import { useState, useEffect, useRef } from 'react';
import {
  Activity, Battery, Database, Navigation, Thermometer,
  Wifi, Satellite, WifiOff,
} from 'lucide-react';

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

const SPARKLINE_MAX = 60;

function Sparkline({ data, color = '#2dd4bf', width = 70, height = 20, thresholds }) {
  if (!data || data.length < 2) return null;

  // Expand range to include threshold lines so they're always visible
  let min = Math.min(...data);
  let max = Math.max(...data);
  if (thresholds) {
    for (const t of thresholds) {
      if (t.value < min) min = t.value - 1;
      if (t.value > max) max = t.value + 1;
    }
  }
  const range = max - min || 1;
  const toY = (v) => height - ((v - min) / range) * (height - 2) - 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    return `${x},${toY(v)}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="sparkline-svg">
      {thresholds && thresholds.map((t, i) => {
        const y = toY(t.value);
        if (y < 0 || y > height) return null;
        return (
          <line key={i} x1="0" y1={y} x2={width} y2={y}
            stroke={t.color || '#ef4444'} strokeWidth="0.8"
            strokeDasharray="2,3" opacity="0.5" />
        );
      })}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.8"
      />
      {data.length > 0 && (() => {
        const lastX = width;
        const lastY = toY(data[data.length - 1]);
        return <circle cx={lastX} cy={lastY} r="2" fill={color} opacity="0.9" />;
      })()}
    </svg>
  );
}

/* ── Contact Status Banner ── */
function ContactBanner({ contactState }) {
  if (!contactState) return null;

  const { inContact, station, elevationDeg, blackoutSec } = contactState;

  const formatBlackout = (sec) => {
    if (sec < 60) return `${Math.round(sec)}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}h ${m}m`;
  };

  if (inContact) {
    return (
      <div className="contact-banner contact-live">
        <div className="contact-banner-row">
          <div className="contact-status-indicator">
            <div className="contact-dot live" />
            <span className="contact-label">LIVE TELEMETRY</span>
          </div>
          <span className="contact-source-tag live">LIVE</span>
        </div>
        <div className="contact-detail">
          <Satellite size={10} />
          <span>{station}</span>
          <span className="contact-elev">{elevationDeg}° elev</span>
        </div>
      </div>
    );
  }

  return (
    <div className="contact-banner contact-blackout">
      <div className="contact-banner-row">
        <div className="contact-status-indicator">
          <div className="contact-dot blackout" />
          <span className="contact-label">NO CONTACT</span>
        </div>
        <span className="contact-source-tag predicted">PREDICTED</span>
      </div>
      <div className="contact-detail">
        <WifiOff size={10} />
        <span>Blackout: {formatBlackout(blackoutSec)}</span>
      </div>
    </div>
  );
}

export default function Telemetry({ telemetry, contactState }) {
  const historyRef = useRef({
    bus_voltage: [], solar: [], panel_temp: [],
    battery_temp: [], snr: [], battery_pct: [],
  });

  useEffect(() => {
    if (!telemetry) return;
    const h = historyRef.current;
    const push = (arr, val) => { arr.push(val); if (arr.length > SPARKLINE_MAX) arr.shift(); };
    push(h.bus_voltage, telemetry.bus_voltage);
    push(h.solar, telemetry.solar_panel_current_a);
    push(h.panel_temp, telemetry.panel_temp_c);
    push(h.battery_temp, telemetry.battery_temp_c);
    push(h.snr, telemetry.snr_db);
    push(h.battery_pct, telemetry.battery_pct);
  }, [telemetry]);

  if (!telemetry) {
    return (
      <div className="sidebar">
        <div className="sidebar-section">
          <div className="empty-state">
            <Activity />
            <div className="empty-state-title">Awaiting Telemetry</div>
            <div className="empty-state-desc">Connecting to satellite...</div>
          </div>
        </div>
      </div>
    );
  }

  const batteryColor = getBatteryColor(telemetry.battery_pct);
  const isPredicted = contactState && !contactState.inContact;
  const satName = telemetry.satellite_name || 'SIM-SAT';

  return (
    <div className={`sidebar ${isPredicted ? 'sidebar-predicted' : ''}`}>
      {/* Satellite Identity */}
      <div className="sidebar-section" style={{ paddingBottom: 4 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontFamily: 'var(--font-heading)', fontSize: '0.85rem',
          color: 'var(--accent-cyan)', letterSpacing: '0.05em',
        }}>
          <Satellite size={14} />
          {satName}
        </div>
      </div>

      {/* Contact Status */}
      <ContactBanner contactState={contactState} />

      {/* Power */}
      <div className="sidebar-section">
        <div className="section-header">
          <div className="section-title"><Battery size={14} /> Power</div>
        </div>
        <div className="telem-card full-width">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div className="telem-label">Battery</div>
              <div className={`telem-value ${batteryColor}`} style={{ fontSize: '1.1rem' }}>
                {telemetry.battery_pct}<span className="telem-unit">%</span>
              </div>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
              {telemetry.battery_wh}/{telemetry.max_battery_wh} Wh
            </span>
          </div>
          <ProgressBar value={telemetry.battery_pct} colorClass={batteryColor} />
        </div>
        <div className="telem-card full-width" style={{ marginTop: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div className="telem-label">Storage</div>
              <div className="telem-value cyan" style={{ fontSize: '1.1rem' }}>
                {telemetry.storage_pct}<span className="telem-unit">%</span>
              </div>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
              {telemetry.storage_used_gb}/{telemetry.max_storage_gb} GB
            </span>
          </div>
          <ProgressBar value={telemetry.storage_pct} colorClass="blue" />
        </div>
      </div>

      {/* Navigation */}
      <div className="sidebar-section">
        <div className="section-header">
          <div className="section-title"><Navigation size={14} /> Navigation</div>
        </div>
        <div className="telemetry-grid">
          <div className="telem-card">
            <div className="telem-label">Lat</div>
            <div className="telem-value cyan" style={{ fontSize: '0.95rem' }}>{telemetry.latitude.toFixed(4)}°</div>
          </div>
          <div className="telem-card">
            <div className="telem-label">Lon</div>
            <div className="telem-value cyan" style={{ fontSize: '0.95rem' }}>{telemetry.longitude.toFixed(4)}°</div>
          </div>
          <div className="telem-card">
            <div className="telem-label">Alt</div>
            <div className="telem-value purple" style={{ fontSize: '0.95rem' }}>{telemetry.altitude_km.toFixed(1)}<span className="telem-unit">km</span></div>
          </div>
          <div className="telem-card">
            <div className="telem-label">Vel</div>
            <div className="telem-value purple" style={{ fontSize: '0.95rem' }}>{telemetry.speed_km_s.toFixed(2)}<span className="telem-unit">km/s</span></div>
          </div>
        </div>
      </div>

      {/* Subsystems */}
      <div className="sidebar-section">
        <div className="section-header">
          <div className="section-title"><Thermometer size={14} /> Subsystems</div>
        </div>
        <div className="telemetry-grid">
          <div className="telem-card telem-card-spark">
            <div className="telem-spark-top">
              <div>
                <div className="telem-label">Bus Voltage</div>
                <div className="telem-value green" style={{ fontSize: '0.9rem' }}>{telemetry.bus_voltage}<span className="telem-unit">V</span></div>
              </div>
              <Sparkline data={historyRef.current.bus_voltage} color="#5eead4"
                thresholds={[{ value: 10, color: '#f59e0b' }, { value: 8, color: '#ef4444' }]} />
            </div>
          </div>
          <div className="telem-card telem-card-spark">
            <div className="telem-spark-top">
              <div>
                <div className="telem-label">Solar</div>
                <div className="telem-value yellow" style={{ fontSize: '0.9rem' }}>{telemetry.solar_panel_current_a}<span className="telem-unit">A</span></div>
              </div>
              <Sparkline data={historyRef.current.solar} color="#f59e0b" />
            </div>
          </div>
          <div className="telem-card telem-card-spark">
            <div className="telem-spark-top">
              <div>
                <div className="telem-label">Panel Temp</div>
                <div className="telem-value cyan" style={{ fontSize: '0.9rem' }}>{telemetry.panel_temp_c}<span className="telem-unit">°C</span></div>
              </div>
              <Sparkline data={historyRef.current.panel_temp} color="#2dd4bf"
                thresholds={[{ value: 85, color: '#f59e0b' }, { value: -40, color: '#f59e0b' }]} />
            </div>
          </div>
          <div className="telem-card telem-card-spark">
            <div className="telem-spark-top">
              <div>
                <div className="telem-label">Batt Temp</div>
                <div className="telem-value cyan" style={{ fontSize: '0.9rem' }}>{telemetry.battery_temp_c}<span className="telem-unit">°C</span></div>
              </div>
              <Sparkline data={historyRef.current.battery_temp} color="#2dd4bf"
                thresholds={[{ value: 45, color: '#f59e0b' }, { value: 0, color: '#f59e0b' }]} />
            </div>
          </div>
          <div className="telem-card telem-card-spark">
            <div className="telem-spark-top">
              <div>
                <div className="telem-label">SNR</div>
                <div className="telem-value green" style={{ fontSize: '0.9rem' }}>{telemetry.snr_db}<span className="telem-unit">dB</span></div>
              </div>
              <Sparkline data={historyRef.current.snr} color="#5eead4"
                thresholds={[{ value: 8, color: '#f59e0b' }, { value: 5, color: '#ef4444' }]} />
            </div>
          </div>
          <div className="telem-card">
            <div className="telem-label">Link</div>
            <div className={`telem-value ${telemetry.link_status === 'NOMINAL' ? 'green' : 'red'}`} style={{ fontSize: '0.85rem' }}>
              <Wifi size={10} style={{ display: 'inline', marginRight: 3 }} />
              {telemetry.link_status}
            </div>
          </div>
          <div className="telem-card">
            <div className="telem-label">Attitude</div>
            <div className="telem-value purple" style={{ fontSize: '0.85rem' }}>{telemetry.attitude_mode}</div>
          </div>
          <div className="telem-card">
            <div className="telem-label">Payload</div>
            <div className={`telem-value ${telemetry.payload_status === 'IDLE' ? 'green' : telemetry.payload_status === 'ACTIVE' ? 'yellow' : 'red'}`} style={{ fontSize: '0.85rem' }}>
              {telemetry.payload_status}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
