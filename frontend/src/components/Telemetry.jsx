import { useState, useEffect, useRef } from 'react';
import {
  Activity, Battery, Navigation, Thermometer,
  Wifi, Satellite, WifiOff, Shield, ClipboardCheck,
} from 'lucide-react';
import { api } from '../services/api';

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
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.2"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
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

/* ── Constraint Status ── */
const MARGIN_LABELS = { POWER: 'Power', THERMAL_PANEL: 'Thermal', THERMAL_BATTERY: 'Batt Thm', COMMS: 'Comms', STORAGE: 'Storage', ORBIT: 'Orbit' };
const STATUS_COLORS = { NOMINAL: '#5eead4', WARNING: '#eab308', CRITICAL: '#ef4444', VIOLATION: '#dc2626', UNKNOWN: '#555' };
const STATUS_LABELS = { NOMINAL: 'OK', WARNING: 'WARN', CRITICAL: 'CRIT', VIOLATION: 'VIOL', UNKNOWN: '—' };

function ConstraintStatus() {
  const [margins, setMargins] = useState(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const c = await api.getConstraints();
      if (mounted && c?.margins) setMargins(c.margins);
    };
    load();
    const id = setInterval(load, 3000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  if (!margins) return null;
  const entries = Object.entries(margins);
  if (entries.length === 0) return null;

  return (
    <div className="sidebar-section">
      <div className="section-header">
        <div className="section-title"><Shield size={12} /> Constraints</div>
      </div>
      <div className="constraint-grid">
        {entries.map(([key, m]) => {
          const status = m?.status || 'UNKNOWN';
          const color = STATUS_COLORS[status];
          return (
            <div key={key} className="constraint-chip" style={{ borderColor: color }}>
              <span className="constraint-chip-label">{MARGIN_LABELS[key] || key}</span>
              <span className="constraint-chip-status" style={{ color }}>{STATUS_LABELS[status]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Approvals Summary ── */
function ApprovalsSummary() {
  const [data, setData] = useState(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const seqs = await api.getCommandSequences();
      if (!mounted) return;
      if (seqs) setData(seqs);
    };
    load();
    const id = setInterval(load, 5000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const sequences = Array.isArray(data) ? data : (data?.sequences || []);
  const pending = sequences.filter(s => !s.approved);
  const approved = sequences.filter(s => s.approved);
  const totalCmds = sequences.reduce((n, s) => n + (s.commands?.length || 0), 0);

  if (sequences.length === 0) return null;

  return (
    <div className="sidebar-section">
      <div className="section-header">
        <div className="section-title"><ClipboardCheck size={12} /> Approvals</div>
      </div>
      <div className="approvals-grid">
        <div className="approval-stat">
          <span className="approval-stat-value" style={{ color: pending.length > 0 ? '#eab308' : '#5eead4' }}>
            {pending.length}
          </span>
          <span className="approval-stat-label">PENDING</span>
        </div>
        <div className="approval-stat">
          <span className="approval-stat-value" style={{ color: '#5eead4' }}>{approved.length}</span>
          <span className="approval-stat-label">APPROVED</span>
        </div>
        <div className="approval-stat">
          <span className="approval-stat-value" style={{ color: '#888' }}>{totalCmds}</span>
          <span className="approval-stat-label">COMMANDS</span>
        </div>
      </div>
      {pending.length > 0 && (
        <div className="approvals-pending-list">
          {pending.slice(0, 2).map((s, i) => (
            <div key={i} className="approval-pending-item">
              <span className="approval-pending-dot" />
              <span className="approval-pending-id">{s.sequence_id?.slice(0, 8) || `SEQ-${i + 1}`}</span>
              <span className="approval-pending-cmds">{s.commands?.length || 0} cmds</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Telemetry({ telemetry, contactState }) {
  const historyRef = useRef({
    solar: [], snr: [], battery_pct: [],
  });

  useEffect(() => {
    if (!telemetry) return;
    const h = historyRef.current;
    const push = (arr, val) => { arr.push(val); if (arr.length > SPARKLINE_MAX) arr.shift(); };
    push(h.solar, telemetry.solar_panel_current_a);
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
      <div className="sidebar-section sidebar-sat-name">
        <div className="sat-identity">
          <Satellite size={14} />
          {satName}
        </div>
      </div>

      {/* Contact Status */}
      <ContactBanner contactState={contactState} />

      {/* Constraint Status */}
      <ConstraintStatus />

      {/* Power */}
      <div className="sidebar-section">
        <div className="section-header">
          <div className="section-title"><Battery size={14} /> Power</div>
        </div>
        <div className="power-grid">
          <div className="telem-card">
            <div className="telem-label">Battery</div>
            <div className={`telem-value ${batteryColor}`}>
              {telemetry.battery_pct}<span className="telem-unit">%</span>
            </div>
            <ProgressBar value={telemetry.battery_pct} colorClass={batteryColor} />
            <div className="telem-detail-sub">{telemetry.battery_wh}/{telemetry.max_battery_wh} Wh</div>
          </div>
          <div className="telem-card">
            <div className="telem-label">Storage</div>
            <div className="telem-value cyan">
              {telemetry.storage_pct}<span className="telem-unit">%</span>
            </div>
            <ProgressBar value={telemetry.storage_pct} colorClass="blue" />
            <div className="telem-detail-sub">{telemetry.storage_used_gb}/{telemetry.max_storage_gb} GB</div>
          </div>
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
            <div className="telem-value cyan">{telemetry.latitude.toFixed(4)}°</div>
          </div>
          <div className="telem-card">
            <div className="telem-label">Lon</div>
            <div className="telem-value cyan">{telemetry.longitude.toFixed(4)}°</div>
          </div>
          <div className="telem-card">
            <div className="telem-label">Alt</div>
            <div className="telem-value purple">{telemetry.altitude_km.toFixed(1)}<span className="telem-unit">km</span></div>
          </div>
          <div className="telem-card">
            <div className="telem-label">Vel</div>
            <div className="telem-value purple">{telemetry.speed_km_s.toFixed(2)}<span className="telem-unit">km/s</span></div>
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
                <div className="telem-label">Solar</div>
                <div className="telem-value yellow">{telemetry.solar_panel_current_a}<span className="telem-unit">A</span></div>
              </div>
              <Sparkline data={historyRef.current.solar} color="#f59e0b" />
            </div>
          </div>
          <div className="telem-card telem-card-spark">
            <div className="telem-spark-top">
              <div>
                <div className="telem-label">SNR</div>
                <div className="telem-value green">{telemetry.snr_db}<span className="telem-unit">dB</span></div>
              </div>
              <Sparkline data={historyRef.current.snr} color="#5eead4"
                thresholds={[{ value: 8, color: '#f59e0b' }, { value: 5, color: '#ef4444' }]} />
            </div>
          </div>
          <div className="telem-card">
            <div className="telem-label">Link</div>
            <div className={`telem-value ${telemetry.link_status === 'NOMINAL' ? 'green' : 'red'}`}>
              <Wifi size={10} style={{ display: 'inline', marginRight: 3 }} />
              {telemetry.link_status}
            </div>
          </div>
          <div className="telem-card">
            <div className="telem-label">Payload</div>
            <div className={`telem-value ${telemetry.payload_status === 'IDLE' ? 'green' : telemetry.payload_status === 'ACTIVE' ? 'yellow' : 'red'}`}>
              {telemetry.payload_status}
            </div>
          </div>
        </div>
      </div>

      {/* Approvals */}
      <ApprovalsSummary />
    </div>
  );
}
