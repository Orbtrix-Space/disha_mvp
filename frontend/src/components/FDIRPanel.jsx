import { useState, useEffect } from 'react';
import {
  AlertTriangle, ShieldAlert, Activity, Shield, Clock, CheckCircle,
  Brain, BatteryCharging, Target, Battery, Thermometer, Wifi, Database, Radio,
} from 'lucide-react';
import { api } from '../services/api';

const SEVERITY_CONFIG = {
  CRITICAL: { color: 'var(--accent-red)', bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.3)' },
  WARNING: { color: 'var(--accent-yellow)', bg: 'rgba(234, 179, 8, 0.08)', border: 'rgba(234, 179, 8, 0.3)' },
};

/* ── Subsystem Health Card ── */
function SubsystemHealth({ telemetry }) {
  if (!telemetry) return null;

  const subsystems = [
    {
      name: 'Power', icon: Battery,
      status: telemetry.battery_pct > 30 ? 'NOMINAL' : telemetry.battery_pct > 15 ? 'WARNING' : 'CRITICAL',
      value: `${telemetry.battery_pct}%`,
      detail: `${telemetry.battery_wh}/${telemetry.max_battery_wh} Wh`,
    },
    {
      name: 'Thermal', icon: Thermometer,
      status: telemetry.panel_temp_c > -20 && telemetry.panel_temp_c < 60 ? 'NOMINAL'
        : telemetry.panel_temp_c > -30 && telemetry.panel_temp_c < 70 ? 'WARNING' : 'CRITICAL',
      value: `${telemetry.panel_temp_c}°C`,
      detail: `Batt: ${telemetry.battery_temp_c}°C`,
    },
    {
      name: 'Comms', icon: Radio,
      status: telemetry.link_status === 'NOMINAL' ? 'NOMINAL' : 'WARNING',
      value: `${telemetry.snr_db} dB`,
      detail: telemetry.link_status,
    },
    {
      name: 'ADCS', icon: Target,
      status: telemetry.attitude_mode === 'NADIR' || telemetry.attitude_mode === 'SUN_TRACKING' ? 'NOMINAL' : 'WARNING',
      value: telemetry.attitude_mode,
      detail: '',
    },
    {
      name: 'Payload', icon: Database,
      status: telemetry.payload_status === 'ERROR' ? 'CRITICAL' : 'NOMINAL',
      value: telemetry.payload_status,
      detail: `${telemetry.storage_pct}% storage`,
    },
    {
      name: 'EPS', icon: BatteryCharging,
      status: telemetry.bus_voltage >= 10 ? 'NOMINAL' : telemetry.bus_voltage >= 8 ? 'WARNING' : 'CRITICAL',
      value: `${telemetry.bus_voltage}V`,
      detail: `Solar: ${telemetry.solar_panel_current_a}A`,
    },
  ];

  const statusColor = { NOMINAL: 'var(--accent-green)', WARNING: 'var(--accent-yellow)', CRITICAL: 'var(--accent-red)' };
  const allNominal = subsystems.every(s => s.status === 'NOMINAL');

  return (
    <div className="fdir-subsystem-panel">
      <div className="fdir-sub-header">
        <Shield size={14} /> SUBSYSTEM HEALTH
        {allNominal && <span className="fdir-sub-nominal-tag">ALL NOMINAL</span>}
      </div>
      <div className="fdir-sub-grid">
        {subsystems.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.name} className="fdir-sub-card" style={{ borderLeftColor: statusColor[s.status] }}>
              <div className="fdir-sub-card-top">
                <Icon size={12} style={{ color: statusColor[s.status] }} />
                <span className="fdir-sub-name">{s.name}</span>
                <span className="fdir-sub-status" style={{ color: statusColor[s.status] }}>{s.status}</span>
              </div>
              <div className="fdir-sub-card-bottom">
                <span className="fdir-sub-value">{s.value}</span>
                {s.detail && <span className="fdir-sub-detail">{s.detail}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Autonomy Status ── */
function AutonomyPanel() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const fetch = () => api.getAutonomyStatus().then(d => d && setData(d));
    fetch();
    const id = setInterval(fetch, 3000);
    return () => clearInterval(id);
  }, []);

  if (!data) return null;

  const modeColor = data.mode === 'AUTONOMOUS' ? '#22c55e'
    : data.mode === 'GUARDED' ? '#f59e0b' : '#ef4444';
  const confPct = Math.round(data.confidence * 100);

  return (
    <div className="fdir-intel-card">
      <div className="fdir-intel-header"><Brain size={12} /> AUTONOMY</div>
      <div className="fdir-intel-row">
        <span className="intel-mode-badge" style={{ color: modeColor, borderColor: modeColor }}>
          <span className="intel-mode-dot" style={{ background: modeColor }} />
          {data.mode}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: modeColor }}>{confPct}%</span>
      </div>
      {data.current_objective && (
        <div className="fdir-intel-obj"><Target size={10} />{data.current_objective}</div>
      )}
    </div>
  );
}

/* ── Constraints Panel ── */
function ConstraintsPanel() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const fetch = () => api.getConstraints().then(d => d && setData(d));
    fetch();
    const id = setInterval(fetch, 3000);
    return () => clearInterval(id);
  }, []);

  if (!data) return null;

  const riskPct = Math.round(data.risk_score * 100);
  const riskColor = riskPct < 20 ? '#22c55e' : riskPct < 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="fdir-intel-card">
      <div className="fdir-intel-header">
        <Shield size={12} /> RISK
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontWeight: 800, color: riskColor }}>{riskPct}%</span>
      </div>
      {data.active_constraints.length === 0 ? (
        <div style={{ color: 'var(--accent-green)', fontSize: '0.6rem', fontFamily: 'var(--font-mono)' }}>All constraints nominal</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {data.active_constraints.map((c, i) => (
            <div key={i} className="intel-constraint-row">
              <span className="intel-constraint-type" style={{ color: c.severity === 'CRITICAL' ? '#ef4444' : '#f59e0b' }}>{c.type}</span>
              <span className="intel-constraint-msg">{c.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main FDIR Panel ── */
export default function FDIRPanel({ alerts, telemetry }) {
  const [filter, setFilter] = useState('all');
  const [fdirSummary, setFdirSummary] = useState(null);

  useEffect(() => {
    const fetch = () => {
      api.getFDIRSummary().then((data) => {
        if (data) setFdirSummary(data);
      });
    };
    fetch();
    const id = setInterval(fetch, 5000);
    return () => clearInterval(id);
  }, []);

  const filtered = filter === 'all'
    ? alerts
    : alerts.filter((a) => a.severity === filter.toUpperCase());

  const critCount = alerts.filter((a) => a.severity === 'CRITICAL').length;
  const warnCount = alerts.filter((a) => a.severity === 'WARNING').length;

  return (
    <div className="fdir-dashboard">
      {/* Left: Subsystem Health + Intelligence */}
      <div className="fdir-left-col">
        <SubsystemHealth telemetry={telemetry} />
        <div className="fdir-intel-section">
          <AutonomyPanel />
          <ConstraintsPanel />
        </div>
      </div>

      {/* Right: Alerts */}
      <div className="fdir-right-col">
        <div className="fdir-panel">
          <div className="fdir-header">
            <div className="section-title" style={{ marginBottom: 12 }}>
              <ShieldAlert size={14} /> Event Management
            </div>

            {fdirSummary && (
              <div className="fdir-summary-bar">
                <div className="fdir-summary-card">
                  <div className="fdir-summary-label">Rules Active</div>
                  <div className="fdir-summary-value" style={{ color: 'var(--accent-cyan)' }}>
                    {fdirSummary.rules_active}
                  </div>
                </div>
                <div className="fdir-summary-card">
                  <div className="fdir-summary-label">Last Check</div>
                  <div className="fdir-summary-value" style={{ color: 'var(--text-secondary)' }}>
                    <Clock size={10} style={{ display: 'inline', marginRight: 3 }} />
                    {fdirSummary.last_evaluation_time}
                  </div>
                </div>
                <div className="fdir-summary-card">
                  <div className="fdir-summary-label">Risk Score</div>
                  <div className="fdir-summary-value" style={{
                    color: fdirSummary.status === 'NOMINAL' ? 'var(--accent-green)'
                      : fdirSummary.status === 'CRITICAL' ? 'var(--accent-red)'
                      : 'var(--accent-yellow)',
                  }}>
                    {fdirSummary.status}
                  </div>
                </div>
                <div className="fdir-summary-card">
                  <div className="fdir-summary-label">Auto Actions</div>
                  <div className="fdir-summary-value" style={{ color: 'var(--accent-purple)' }}>
                    {fdirSummary.auto_actions_today}
                  </div>
                </div>
              </div>
            )}

            <div className="fdir-status-bar">
              <div className="fdir-status-item">
                <Activity size={10} />
                <span>Engine: ACTIVE</span>
              </div>
              <div className="fdir-status-item">
                <AlertTriangle size={10} />
                <span>{critCount} Critical / {warnCount} Warning</span>
              </div>
            </div>

            <div className="fdir-filters">
              {['all', 'critical', 'warning'].map((f) => (
                <button
                  key={f}
                  className={`fdir-filter-btn ${filter === f ? 'active' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? `All (${alerts.length})` :
                   f === 'critical' ? `Critical (${critCount})` :
                   `Warning (${warnCount})`}
                </button>
              ))}
            </div>
          </div>

          <div className="fdir-list">
            {filtered.length === 0 ? (
              <div className="fdir-nominal-state">
                <div className="fdir-nominal-icon"><CheckCircle size={48} /></div>
                <div className="fdir-nominal-title">System Nominal</div>
                <div className="fdir-nominal-desc">
                  All rules within threshold. FDIR engine monitoring {fdirSummary?.rules_active || 7} constraint rules at 1 Hz.
                </div>
              </div>
            ) : (
              filtered.map((alert, i) => {
                const cfg = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.WARNING;
                return (
                  <div
                    key={alert.alert_id + i}
                    className="fdir-alert-card"
                    style={{ borderLeftColor: cfg.color, background: cfg.bg }}
                  >
                    <div className="fdir-alert-header">
                      <span className="fdir-alert-severity" style={{ color: cfg.color }}>
                        <AlertTriangle size={12} /> {alert.severity}
                      </span>
                      <span className="fdir-alert-code">{alert.code}</span>
                    </div>
                    <div className="fdir-alert-message">{alert.message}</div>
                    {alert.corrective_action && (
                      <div className="fdir-alert-action">
                        <span style={{ color: 'var(--accent-cyan)', fontSize: '0.6rem', fontWeight: 600 }}>
                          RECOMMENDED ACTION:
                        </span>
                        <span>{alert.corrective_action}</span>
                      </div>
                    )}
                    <div className="fdir-alert-time">
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
