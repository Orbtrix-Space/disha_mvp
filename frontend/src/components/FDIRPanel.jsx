import { useState, useEffect, useRef, useMemo } from 'react';
import {
  AlertTriangle, ShieldAlert, Activity, Shield, Clock, CheckCircle,
  Brain, BatteryCharging, Target, Battery, Thermometer, Wifi, Database, Radio,
  Zap, ArrowRight, Lock, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import { api } from '../services/api';

const SEVERITY_CONFIG = {
  CRITICAL: { color: 'var(--accent-red)', bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.3)' },
  WARNING: { color: 'var(--accent-yellow)', bg: 'rgba(234, 179, 8, 0.08)', border: 'rgba(234, 179, 8, 0.3)' },
};
const MODE_COLORS = { AUTONOMOUS: '#5eead4', GUARDED: '#14b8a6', SAFE: '#ef4444' };
const CONFIDENCE_COLORS = { HIGH: '#5eead4', MEDIUM: '#14b8a6', LOW: '#ef4444' };
const PRIORITY_COLORS = { CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#eab308', LOW: '#5eead4' };
const MARGIN_STATUS_COLORS = { NOMINAL: '#5eead4', WARNING: '#eab308', CRITICAL: '#ef4444', VIOLATION: '#dc2626', UNKNOWN: '#555' };
const MARGIN_ICONS = { POWER: 'PWR', THERMAL_PANEL: 'THR', THERMAL_BATTERY: 'BAT', COMMS: 'COM', STORAGE: 'STR', ORBIT: 'ORB' };

/* ── Compact SVG Sparkline ── */
function MiniSpark({ data, color, height = 28, width = 60 }) {
  if (!data || data.length < 2) return null;
  const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - 2 - ((v - mn) / rng) * (height - 4)}`).join(' ');
  return (
    <svg width={width} height={height} className="fdir-minispark">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════
   LEFT COLUMN — Subsystem Health (with sparklines)
   ═══════════════════════════════════════════════════ */
function SubsystemHealth({ telemetry }) {
  const histRef = useRef({ batt: [], temp: [], snr: [], volt: [], solar: [], storage: [] });

  useEffect(() => {
    if (!telemetry) return;
    const h = histRef.current;
    const push = (a, v) => { if (v == null) return; a.push(v); if (a.length > 60) a.shift(); };
    push(h.batt, telemetry.battery_pct);
    push(h.temp, telemetry.panel_temp_c);
    push(h.snr, telemetry.snr_db);
    push(h.volt, telemetry.bus_voltage);
    push(h.solar, telemetry.solar_panel_current_a);
    push(h.storage, telemetry.storage_pct);
  }, [telemetry]);

  if (!telemetry) return null;

  const subs = [
    { name: 'Power', icon: Battery, status: telemetry.battery_pct > 30 ? 'NOMINAL' : telemetry.battery_pct > 15 ? 'WARNING' : 'CRITICAL',
      value: `${telemetry.battery_pct}%`, detail: `${telemetry.battery_wh}/${telemetry.max_battery_wh} Wh`, hist: histRef.current.batt, color: '#5eead4' },
    { name: 'Thermal', icon: Thermometer, status: telemetry.panel_temp_c > -20 && telemetry.panel_temp_c < 60 ? 'NOMINAL' : 'WARNING',
      value: `${telemetry.panel_temp_c}°C`, detail: `Batt: ${telemetry.battery_temp_c}°C`, hist: histRef.current.temp, color: '#2dd4bf' },
    { name: 'Comms', icon: Radio, status: telemetry.link_status === 'NOMINAL' ? 'NOMINAL' : 'WARNING',
      value: `${telemetry.snr_db} dB`, detail: telemetry.link_status, hist: histRef.current.snr, color: '#14b8a6' },
    { name: 'ADCS', icon: Target, status: telemetry.attitude_mode === 'NADIR' || telemetry.attitude_mode === 'SUN_TRACKING' ? 'NOMINAL' : 'WARNING',
      value: telemetry.attitude_mode, detail: '', hist: null, color: '#5eead4' },
    { name: 'Payload', icon: Database, status: telemetry.payload_status === 'ERROR' ? 'CRITICAL' : 'NOMINAL',
      value: telemetry.payload_status, detail: `${telemetry.storage_pct}%`, hist: histRef.current.storage, color: '#a855f7' },
    { name: 'EPS', icon: BatteryCharging, status: telemetry.bus_voltage >= 10 ? 'NOMINAL' : telemetry.bus_voltage >= 8 ? 'WARNING' : 'CRITICAL',
      value: `${telemetry.bus_voltage}V`, detail: `Solar: ${telemetry.solar_panel_current_a}A`, hist: histRef.current.volt, color: '#f59e0b' },
  ];

  const statusColor = { NOMINAL: 'var(--accent-green)', WARNING: 'var(--accent-yellow)', CRITICAL: 'var(--accent-red)' };
  const allNominal = subs.every(s => s.status === 'NOMINAL');

  return (
    <div className="fdir-subsystem-panel">
      <div className="fdir-sub-header">
        <Shield size={13} /> SUBSYSTEM HEALTH
        {allNominal && <span className="fdir-sub-nominal-tag">ALL NOMINAL</span>}
      </div>
      <div className="fdir-sub-grid">
        {subs.map(s => {
          const Icon = s.icon;
          // Trend arrow
          const arr = s.hist;
          const trend = arr && arr.length > 5 ? (arr[arr.length - 1] - arr[arr.length - 6]) : 0;
          const TI = Math.abs(trend) < 0.05 ? Minus : trend > 0 ? TrendingUp : TrendingDown;
          return (
            <div key={s.name} className="fdir-sub-card" style={{ borderLeftColor: statusColor[s.status] }}>
              <div className="fdir-sub-card-top">
                <Icon size={11} style={{ color: statusColor[s.status] }} />
                <span className="fdir-sub-name">{s.name}</span>
                <TI size={9} style={{ color: Math.abs(trend) < 0.05 ? '#333' : trend > 0 ? '#5eead4' : '#ef4444', marginLeft: 'auto' }} />
                <span className="fdir-sub-status" style={{ color: statusColor[s.status] }}>{s.status}</span>
              </div>
              <div className="fdir-sub-card-bottom">
                <div>
                  <span className="fdir-sub-value">{s.value}</span>
                  {s.detail && <span className="fdir-sub-detail">{s.detail}</span>}
                </div>
                {s.hist && <MiniSpark data={s.hist} color={s.color} height={22} width={50} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   LEFT — Autonomy + Constraints (kept compact)
   ═══════════════════════════════════════════════════ */
function AutonomyCompact() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const fetch = () => api.getAutonomyStatus().then(d => d && setData(d));
    fetch();
    const id = setInterval(fetch, 3000);
    return () => clearInterval(id);
  }, []);

  if (!data) return null;
  const modeColor = MODE_COLORS[data.mode] || '#5eead4';
  const confColor = CONFIDENCE_COLORS[data.confidence_level] || '#5eead4';
  const lastDec = data.last_decision;
  const isStructured = typeof lastDec === 'object' && lastDec?.action;

  return (
    <div className="fdir-intel-card">
      <div className="fdir-intel-header"><Brain size={12} /> AUTONOMY</div>
      <div className="fdir-intel-row">
        <span className="intel-mode-badge" style={{ color: modeColor, borderColor: modeColor }}>
          <span className="intel-mode-dot" style={{ background: modeColor }} /> {data.mode}
        </span>
        <span style={{ marginLeft: 'auto', color: confColor, fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.65rem' }}>
          {data.confidence_level} {Math.round((data.confidence_score || 1) * 100)}%
        </span>
      </div>
      {data.current_objective && <div className="fdir-intel-obj"><Target size={9} />{data.current_objective}</div>}
      {isStructured && (
        <div className="fdir-decision-compact">
          <div className="fdir-decision-action">
            <Activity size={8} /> <span>{lastDec.action?.replace(/_/g, ' ')}</span>
            <span className="fdir-decision-priority" style={{ color: PRIORITY_COLORS[lastDec.priority] }}>{lastDec.priority}</span>
          </div>
          <div className="fdir-decision-reason">{lastDec.reason}</div>
        </div>
      )}
      {data.override_info?.active && (
        <div className="fdir-override-banner"><Lock size={8} /> OVERRIDE: {data.override_info.forced_mode}</div>
      )}
    </div>
  );
}

function ConstraintsCompact() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const fetch = () => api.getConstraints().then(d => d && setData(d));
    fetch();
    const id = setInterval(fetch, 3000);
    return () => clearInterval(id);
  }, []);

  if (!data) return null;
  const riskPct = Math.round(data.risk_score * 100);
  const riskColor = riskPct < 20 ? '#5eead4' : riskPct < 50 ? '#eab308' : '#ef4444';
  const margins = Object.entries(data.margins || {});

  return (
    <div className="fdir-intel-card">
      <div className="fdir-intel-header">
        <Shield size={12} /> RISK
        <span style={{ marginLeft: 'auto', color: riskColor, fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.7rem' }}>{riskPct}%</span>
      </div>
      <div className="fdir-risk-bar">
        <div className="fdir-risk-track"><div className="fdir-risk-fill" style={{ width: `${riskPct}%`, background: riskColor }} /></div>
      </div>
      {margins.length > 0 && (
        <div className="fdir-margins-row">
          {margins.map(([key, m]) => (
            <div key={key} className="fdir-margin-chip" style={{ borderColor: MARGIN_STATUS_COLORS[m?.status || 'UNKNOWN'] }}>
              <span className="fdir-margin-chip-label">{MARGIN_ICONS[key] || key.slice(0, 3)}</span>
              <span className="fdir-margin-chip-pct" style={{ color: MARGIN_STATUS_COLORS[m?.status || 'UNKNOWN'] }}>{Math.round(m?.margin_pct || 0)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   CENTER — FDIR ANALYTICS (NEW)
   ═══════════════════════════════════════════════════ */

/* Risk Trend Graph */
function RiskTrendGraph() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const fetch = () => {
      api.getConstraints().then(d => {
        if (!d) return;
        setHistory(prev => {
          const next = [...prev, { t: prev.length, risk: Math.round(d.risk_score * 100) }];
          return next.length > 60 ? next.slice(-60) : next;
        });
      });
    };
    fetch();
    const id = setInterval(fetch, 2000);
    return () => clearInterval(id);
  }, []);

  if (history.length < 2) return null;

  const latest = history[history.length - 1]?.risk || 0;
  const prev = history.length > 5 ? history[history.length - 6]?.risk || 0 : latest;
  const trend = latest - prev;
  const trendColor = Math.abs(trend) < 2 ? '#888' : trend > 0 ? '#ef4444' : '#5eead4';

  // SVG sparkline
  const W = 200, H = 50;
  const mn = Math.min(...history.map(h => h.risk)), mx = Math.max(...history.map(h => h.risk), 100);
  const rng = mx - mn || 1;
  const pts = history.map((h, i) => `${(i / (history.length - 1)) * W},${H - 3 - ((h.risk - mn) / rng) * (H - 6)}`).join(' ');

  return (
    <div className="mon-card">
      <div className="mon-header"><Activity size={12} /> RISK TREND</div>
      <div className="mon-body">
        <div className="mon-risk-top">
          <span className="mon-risk-val" style={{ color: latest > 50 ? '#ef4444' : latest > 20 ? '#eab308' : '#5eead4' }}>{latest}%</span>
          <span className="mon-risk-trend" style={{ color: trendColor }}>
            {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'} {Math.abs(trend)}%
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="mon-trend-svg">
          <line x1="0" y1={H - 3 - ((50 - mn) / rng) * (H - 6)} x2={W} y2={H - 3 - ((50 - mn) / rng) * (H - 6)}
            stroke="#ef4444" strokeWidth="0.7" strokeDasharray="4,4" opacity="0.3" />
          <line x1="0" y1={H - 3 - ((20 - mn) / rng) * (H - 6)} x2={W} y2={H - 3 - ((20 - mn) / rng) * (H - 6)}
            stroke="#eab308" strokeWidth="0.7" strokeDasharray="4,4" opacity="0.3" />
          <polygon points={`0,${H} ${pts} ${W},${H}`} fill={latest > 50 ? '#ef4444' : '#5eead4'} opacity="0.06" />
          <polyline points={pts} fill="none" stroke={latest > 50 ? '#ef4444' : latest > 20 ? '#eab308' : '#5eead4'}
            strokeWidth="2" strokeLinecap="round" opacity="0.85" />
        </svg>
      </div>
    </div>
  );
}

/* Risk Breakdown */
function RiskBreakdown() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const fetch = () => api.getConstraints().then(d => d && setData(d));
    fetch();
    const id = setInterval(fetch, 3000);
    return () => clearInterval(id);
  }, []);

  if (!data?.margins) return null;

  const categories = [
    { key: 'COMMS', label: 'Comms', icon: Radio },
    { key: 'POWER', label: 'Power', icon: Battery },
    { key: 'THERMAL_PANEL', label: 'Thermal', icon: Thermometer },
    { key: 'STORAGE', label: 'Storage', icon: Database },
    { key: 'ORBIT', label: 'Orbit', icon: Target },
  ];

  return (
    <div className="mon-card">
      <div className="mon-header"><Shield size={12} /> RISK BREAKDOWN</div>
      <div className="mon-body">
        {categories.map(c => {
          const m = data.margins[c.key];
          const pct = m ? Math.round(m.margin_pct || 0) : 100;
          const color = MARGIN_STATUS_COLORS[m?.status || 'NOMINAL'];
          const Icon = c.icon;
          return (
            <div key={c.key} className="mon-rb-item">
              <Icon size={9} style={{ color: '#666', flexShrink: 0 }} />
              <span className="mon-rb-label">{c.label}</span>
              <div className="mon-rb-bar"><div className="mon-rb-fill" style={{ width: `${pct}%`, background: color }} /></div>
              <span className="mon-rb-pct" style={{ color }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Comms Analysis */
function CommsAnalysis({ telemetry }) {
  const snrHist = useRef([]);
  useEffect(() => {
    if (telemetry?.snr_db == null) return;
    snrHist.current.push(telemetry.snr_db);
    if (snrHist.current.length > 60) snrHist.current.shift();
  }, [telemetry]);

  const snr = telemetry?.snr_db ?? 0;
  const link = telemetry?.link_status || 'UNKNOWN';
  const linkColor = link === 'NOMINAL' ? '#5eead4' : link === 'DEGRADED' ? '#eab308' : '#ef4444';

  // Approximate link margin
  const margin = Math.max(0, snr - 5); // 5dB is threshold

  return (
    <div className="mon-card">
      <div className="mon-header"><Wifi size={12} /> COMMS ANALYSIS</div>
      <div className="mon-body">
        <div className="mon-comms-row">
          <div className="mon-comms-stat">
            <span className="mon-comms-label">SNR</span>
            <span className="mon-comms-val" style={{ color: snr > 8 ? '#5eead4' : snr > 5 ? '#eab308' : '#ef4444' }}>{snr} dB</span>
          </div>
          <div className="mon-comms-stat">
            <span className="mon-comms-label">Link</span>
            <span className="mon-comms-val" style={{ color: linkColor }}>{link}</span>
          </div>
          <div className="mon-comms-stat">
            <span className="mon-comms-label">Margin</span>
            <span className="mon-comms-val">{margin.toFixed(1)} dB</span>
          </div>
        </div>
        <MiniSpark data={snrHist.current} color={snr > 8 ? '#5eead4' : '#eab308'} height={30} width={200} />
      </div>
    </div>
  );
}

/* Decision Trace Stream */
function DecisionTrace() {
  const [decisions, setDecisions] = useState([]);

  useEffect(() => {
    const fetch = () => api.getLatestDecisions(6).then(d => { if (d?.decisions) setDecisions(d.decisions); });
    fetch();
    const id = setInterval(fetch, 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mon-card mon-trace">
      <div className="mon-header"><Brain size={12} /> DECISION TRACE</div>
      <div className="mon-body">
        {decisions.length === 0 ? (
          <div className="mon-empty">No decisions yet</div>
        ) : (
          <div className="mon-trace-list">
            {[...decisions].reverse().slice(0, 5).map((d, i) => (
              <div key={i} className="mon-trace-item">
                <div className="mon-trace-dot" style={{ background: PRIORITY_COLORS[d.priority] || '#555' }} />
                {i < Math.min(decisions.length, 5) - 1 && <div className="mon-trace-line" />}
                <div className="mon-trace-content">
                  <div className="mon-trace-top">
                    <span className="mon-trace-time">{d.timestamp ? new Date(d.timestamp).toLocaleTimeString() : '—'}</span>
                    <span className="mon-trace-priority" style={{ color: PRIORITY_COLORS[d.priority] }}>{d.priority}</span>
                  </div>
                  <div className="mon-trace-action">{d.action?.replace(/_/g, ' ')}</div>
                  <div className="mon-trace-reason">{d.reason}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* System Stability Index */
function StabilityIndex({ telemetry }) {
  const [constraints, setConstraints] = useState(null);

  useEffect(() => {
    const fetch = () => api.getConstraints().then(d => d && setConstraints(d));
    fetch();
    const id = setInterval(fetch, 3000);
    return () => clearInterval(id);
  }, []);

  const margins = constraints?.margins || {};
  const marginValues = Object.values(margins).map(m => m?.margin_pct || 0);
  const avgMargin = marginValues.length > 0 ? Math.round(marginValues.reduce((a, b) => a + b, 0) / marginValues.length) : 100;
  const risk = constraints?.risk_score || 0;
  const stability = Math.round(Math.max(0, Math.min(100, avgMargin * (1 - risk))));
  const color = stability > 70 ? '#5eead4' : stability > 40 ? '#eab308' : '#ef4444';

  return (
    <div className="mon-card">
      <div className="mon-header"><Activity size={12} /> STABILITY INDEX</div>
      <div className="mon-body">
        <div className="mon-stability-row">
          <span className="mon-stability-score" style={{ color }}>{stability}</span>
          <div className="mon-stability-info">
            <span className="mon-stability-label">System Stability</span>
            <span className="mon-stability-desc">
              {stability > 70 ? 'All subsystems within margins' :
               stability > 40 ? 'Degraded — monitoring required' :
               'Unstable — intervention recommended'}
            </span>
          </div>
        </div>
        <div className="mon-stability-bar">
          <div className="mon-stability-fill" style={{ width: `${stability}%`, background: color }} />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   RIGHT — System Intelligence Panel (replaces empty space)
   ═══════════════════════════════════════════════════ */

/* Active Alerts (compact — always visible at top) */
function AlertsCompact({ alerts, fdirSummary }) {
  const critCount = alerts.filter(a => a.severity === 'CRITICAL').length;
  const warnCount = alerts.filter(a => a.severity === 'WARNING').length;

  return (
    <div className="mon-card">
      <div className="mon-header">
        <ShieldAlert size={12} /> ALERTS
        <span className="mon-alert-counts">
          {critCount > 0 && <span style={{ color: '#ef4444' }}>{critCount} CRIT</span>}
          {warnCount > 0 && <span style={{ color: '#eab308' }}>{warnCount} WARN</span>}
          {alerts.length === 0 && <span style={{ color: '#5eead4' }}>NOMINAL</span>}
        </span>
      </div>
      <div className="mon-body">
        {fdirSummary && (
          <div className="mon-alert-summary">
            <span>Rules: <b>{fdirSummary.rules_active}</b></span>
            <span>Check: <b>{fdirSummary.last_evaluation_time}</b></span>
            <span style={{ color: fdirSummary.status === 'NOMINAL' ? '#5eead4' : fdirSummary.status === 'CRITICAL' ? '#ef4444' : '#eab308' }}>
              {fdirSummary.status}
            </span>
          </div>
        )}
        {alerts.length > 0 ? (
          <div className="mon-alert-list">
            {alerts.slice(0, 3).map((a, i) => {
              const cfg = SEVERITY_CONFIG[a.severity] || SEVERITY_CONFIG.WARNING;
              return (
                <div key={i} className="mon-alert-item" style={{ borderLeftColor: cfg.color }}>
                  <span className="mon-alert-sev" style={{ color: cfg.color }}>{a.severity}</span>
                  <span className="mon-alert-msg">{a.message}</span>
                  <span className="mon-alert-time">{new Date(a.timestamp).toLocaleTimeString()}</span>
                </div>
              );
            })}
            {alerts.length > 3 && <div className="mon-alert-more">+{alerts.length - 3} more</div>}
          </div>
        ) : (
          <div className="mon-nominal-badge"><CheckCircle size={10} /> All rules within threshold</div>
        )}
      </div>
    </div>
  );
}

/* Live Event Stream */
function LiveEventStream({ alerts, telemetry }) {
  const eventsRef = useRef([]);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!telemetry) return;
    const events = eventsRef.current;
    const now = new Date().toLocaleTimeString();

    // Track state changes as events
    if (telemetry.link_status && telemetry.link_status !== 'NOMINAL') {
      const last = events.find(e => e.type === 'comms');
      if (!last || last.msg !== telemetry.link_status) {
        events.unshift({ time: now, type: 'comms', msg: `Link: ${telemetry.link_status}`, sev: 'warn' });
      }
    }
    if (telemetry.in_eclipse !== undefined) {
      const last = events.find(e => e.type === 'eclipse');
      if (!last || last.val !== telemetry.in_eclipse) {
        events.unshift({ time: now, type: 'eclipse', msg: telemetry.in_eclipse ? 'Eclipse entry' : 'Eclipse exit', sev: 'info', val: telemetry.in_eclipse });
      }
    }

    // Add new alerts as events
    for (const a of alerts.slice(0, 2)) {
      if (!events.find(e => e.alertId === a.alert_id)) {
        events.unshift({ time: now, type: 'alert', msg: a.message, sev: a.severity === 'CRITICAL' ? 'crit' : 'warn', alertId: a.alert_id });
      }
    }

    while (events.length > 15) events.pop();
    forceUpdate(n => n + 1);
  }, [telemetry, alerts]);

  const sevColors = { crit: '#ef4444', warn: '#eab308', info: '#5eead4' };

  return (
    <div className="mon-card mon-events-card">
      <div className="mon-header"><Activity size={12} /> LIVE EVENT STREAM</div>
      <div className="mon-body">
        {eventsRef.current.length === 0 ? (
          <div className="mon-empty">Monitoring...</div>
        ) : (
          <div className="mon-event-stream">
            {eventsRef.current.slice(0, 8).map((ev, i) => (
              <div key={i} className="mon-stream-item">
                <span className="mon-stream-dot" style={{ background: sevColors[ev.sev] || '#555' }} />
                <span className="mon-stream-time">{ev.time}</span>
                <span className="mon-stream-msg">{ev.msg}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* Rule Engine Visualization */
function RuleEngineVis({ fdirSummary }) {
  const RULE_CATEGORIES = [
    { name: 'Power', rules: ['BATT_CRITICAL', 'BATT_LOW'], icon: Battery, color: '#5eead4' },
    { name: 'Comms', rules: ['SNR_LOW', 'SNR_CRITICAL'], icon: Radio, color: '#14b8a6' },
    { name: 'Thermal', rules: ['TEMP_PANEL_HIGH', 'TEMP_PANEL_LOW', 'TEMP_BATT_HIGH', 'TEMP_BATT_LOW'], icon: Thermometer, color: '#2dd4bf' },
    { name: 'Storage', rules: ['STORAGE_HIGH'], icon: Database, color: '#a855f7' },
    { name: 'Orbit', rules: ['ALT_LOW', 'POINTING_ERROR'], icon: Target, color: '#0d9488' },
  ];

  return (
    <div className="mon-card">
      <div className="mon-header"><Shield size={12} /> RULE ENGINE</div>
      <div className="mon-body">
        {/* Pipeline visualization */}
        <div className="mon-pipeline">
          <span className="mon-pipe-step active">SENSOR</span>
          <span className="mon-pipe-arrow">→</span>
          <span className="mon-pipe-step active">CONSTRAINT</span>
          <span className="mon-pipe-arrow">→</span>
          <span className="mon-pipe-step active">DECISION</span>
          <span className="mon-pipe-arrow">→</span>
          <span className="mon-pipe-step">ACTION</span>
        </div>
        <div className="mon-rule-grid">
          {RULE_CATEGORIES.map(cat => {
            const Icon = cat.icon;
            return (
              <div key={cat.name} className="mon-rule-item">
                <Icon size={9} style={{ color: cat.color }} />
                <span className="mon-rule-name">{cat.name}</span>
                <span className="mon-rule-count">{cat.rules.length} rules</span>
                <span className="mon-rule-status" style={{ color: '#5eead4' }}>ACTIVE</span>
              </div>
            );
          })}
        </div>
        {fdirSummary && (
          <div className="mon-rule-total">
            {fdirSummary.rules_active} rules evaluating at 1 Hz · {fdirSummary.auto_actions_today || 0} auto-actions today
          </div>
        )}
      </div>
    </div>
  );
}

/* System State Flow */
function SystemStateFlow() {
  const [autonomy, setAutonomy] = useState(null);

  useEffect(() => {
    const fetch = () => api.getAutonomyStatus().then(d => d && setAutonomy(d));
    fetch();
    const id = setInterval(fetch, 3000);
    return () => clearInterval(id);
  }, []);

  const mode = autonomy?.mode || 'AUTONOMOUS';
  const STATES = [
    { key: 'AUTONOMOUS', label: 'NOMINAL', color: '#5eead4' },
    { key: 'GUARDED', label: 'GUARDED', color: '#14b8a6' },
    { key: 'SAFE', label: 'SAFE', color: '#ef4444' },
  ];

  return (
    <div className="mon-card">
      <div className="mon-header"><ArrowRight size={12} /> SYSTEM STATE FLOW</div>
      <div className="mon-body">
        <div className="mon-state-flow">
          {STATES.map((s, i) => (
            <div key={s.key} className={`mon-state-node ${mode === s.key ? 'active' : ''}`}
              style={{ borderColor: mode === s.key ? s.color : '#333', color: mode === s.key ? s.color : '#555' }}>
              {mode === s.key && <span className="mon-state-dot" style={{ background: s.color }} />}
              {s.label}
              {i < STATES.length - 1 && <span className="mon-state-arrow">→</span>}
            </div>
          ))}
        </div>
        {autonomy?.pending_transition && (
          <div className="mon-state-pending">
            Transitioning to {autonomy.pending_transition.target_mode} ({Math.max(0, autonomy.pending_transition.required_sec - autonomy.pending_transition.elapsed_sec)}s)
          </div>
        )}
      </div>
    </div>
  );
}

/* Auto Actions Panel */
function AutoActions() {
  const [decisions, setDecisions] = useState([]);

  useEffect(() => {
    const fetch = () => api.getLatestDecisions(4).then(d => { if (d?.decisions) setDecisions(d.decisions); });
    fetch();
    const id = setInterval(fetch, 3000);
    return () => clearInterval(id);
  }, []);

  const actions = decisions.filter(d => d.action && d.action !== 'initialize').slice(-3).reverse();

  return (
    <div className="mon-card">
      <div className="mon-header"><Zap size={12} /> AUTO ACTIONS</div>
      <div className="mon-body">
        {actions.length === 0 ? (
          <div className="mon-empty">No autonomous actions</div>
        ) : (
          <div className="mon-action-list">
            {actions.map((a, i) => (
              <div key={i} className="mon-action-item">
                <span className="mon-action-priority" style={{ color: PRIORITY_COLORS[a.priority] || '#555' }}>●</span>
                <div className="mon-action-content">
                  <span className="mon-action-name">{a.action?.replace(/_/g, ' ')}</span>
                  <span className="mon-action-outcome">{a.expected_outcome}</span>
                </div>
                <span className="mon-action-time">{a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN — 3-Column Layout
   ═══════════════════════════════════════════════════ */
export default function FDIRPanel({ alerts, telemetry }) {
  const [fdirSummary, setFdirSummary] = useState(null);

  useEffect(() => {
    const fetch = () => api.getFDIRSummary().then(d => d && setFdirSummary(d));
    fetch();
    const id = setInterval(fetch, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fdir-dashboard-v2">
      {/* LEFT — Subsystem Health + Autonomy + Constraints */}
      <div className="fdir-col fdir-col-left">
        <SubsystemHealth telemetry={telemetry} />
        <div className="fdir-intel-section">
          <AutonomyCompact />
          <ConstraintsCompact />
        </div>
      </div>

      {/* CENTER — FDIR Analytics */}
      <div className="fdir-col fdir-col-center">
        <RiskTrendGraph />
        <RiskBreakdown />
        <CommsAnalysis telemetry={telemetry} />
        <StabilityIndex telemetry={telemetry} />
        <DecisionTrace />
      </div>

      {/* RIGHT — System Intelligence */}
      <div className="fdir-col fdir-col-right">
        <AlertsCompact alerts={alerts} fdirSummary={fdirSummary} />
        <LiveEventStream alerts={alerts} telemetry={telemetry} />
        <RuleEngineVis fdirSummary={fdirSummary} />
        <SystemStateFlow />
        <AutoActions />
      </div>
    </div>
  );
}
