import { useState, useEffect, useRef } from 'react';
import {
  Activity, Battery, Database, Navigation, Gauge, Thermometer,
  Zap, Radio, Wifi, ChevronDown, ChevronUp, Shield, Brain,
  AlertTriangle, BatteryCharging, Target,
} from 'lucide-react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis,
  ResponsiveContainer, ReferenceLine, Tooltip, CartesianGrid,
} from 'recharts';
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

function Sparkline({ data, color = '#22d3ee', width = 70, height = 20 }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="sparkline-svg">
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
        const lastY = height - ((data[data.length - 1] - min) / range) * (height - 2) - 1;
        return <circle cx={lastX} cy={lastY} r="2" fill={color} opacity="0.9" />;
      })()}
    </svg>
  );
}

function ChartTooltipContent({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">T+{label}m</div>
      {payload.map((p, i) => (
        <div key={i} className="chart-tooltip-row">
          <span style={{ color: p.color }}>{p.name}:</span>{' '}
          <span>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}{p.unit || ''}</span>
        </div>
      ))}
    </div>
  );
}

function TLEQuickLoad() {
  const [loading, setLoading] = useState(false);
  const QUICK_SATS = [
    { name: 'ISS', norad: 25544 },
    { name: 'NOAA 19', norad: 33591 },
    { name: 'Landsat 9', norad: 49260 },
  ];

  const load = async (id) => {
    setLoading(true);
    await api.loadTLE(id);
    setLoading(false);
  };

  return (
    <div className="quick-select-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
      {QUICK_SATS.map(sat => (
        <button key={sat.norad} className="quick-city-btn" onClick={() => load(sat.norad)} disabled={loading}>
          <Radio size={10} />
          {sat.name}
        </button>
      ))}
    </div>
  );
}

/* ── Autonomy Status Panel ── */
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
  const confColor = confPct >= 75 ? '#22c55e' : confPct >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="sidebar-section intel-section">
      <div className="section-header">
        <div className="section-title"><Brain size={14} /> Autonomy</div>
      </div>
      <div className="intel-mode-row">
        <div className="intel-mode-badge" style={{ color: modeColor, borderColor: modeColor }}>
          <div className="intel-mode-dot" style={{ background: modeColor }} />
          {data.mode}
        </div>
        <div className="intel-conf" style={{ color: confColor }}>
          {confPct}%
        </div>
      </div>
      <div className="intel-objective">
        <Target size={10} />
        <span>{data.current_objective}</span>
      </div>
      {data.last_decision && (
        <div className="intel-decision">
          {data.last_decision}
        </div>
      )}
    </div>
  );
}

/* ── Constraints & Risk Panel ── */
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
    <div className="sidebar-section intel-section">
      <div className="section-header">
        <div className="section-title"><Shield size={14} /> Risk</div>
        <div className="intel-risk-value" style={{ color: riskColor }}>{riskPct}%</div>
      </div>
      <ProgressBar value={riskPct} colorClass={riskPct < 20 ? 'green' : riskPct < 50 ? 'yellow' : 'red'} />
      {data.active_constraints.length === 0 ? (
        <div className="intel-nominal">All constraints nominal</div>
      ) : (
        <div className="intel-constraints-list">
          {data.active_constraints.map((c, i) => (
            <div key={i} className="intel-constraint-row">
              <span
                className="intel-constraint-type"
                style={{ color: c.severity === 'CRITICAL' ? '#ef4444' : '#f59e0b' }}
              >
                {c.type}
              </span>
              <span className="intel-constraint-msg">{c.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Power Projection Panel ── */
function PowerProjectionPanel() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const fetch = () => api.getPowerProjection().then(d => d && setData(d));
    fetch();
    const id = setInterval(fetch, 10000);
    return () => clearInterval(id);
  }, []);

  if (!data) return null;

  const eclColor = data.projected_next_eclipse < 25 ? '#ef4444'
    : data.projected_next_eclipse < 40 ? '#f59e0b' : '#22c55e';
  const orbColor = data.projected_next_orbit < 25 ? '#ef4444'
    : data.projected_next_orbit < 40 ? '#f59e0b' : '#22c55e';

  return (
    <div className="sidebar-section intel-section">
      <div className="section-header">
        <div className="section-title"><BatteryCharging size={14} /> Power Projection</div>
        <span className="intel-mode-tag" style={{
          color: data.current_mode === 'SUNLIT' ? '#f59e0b' : '#a855f7',
        }}>
          {data.current_mode}
        </span>
      </div>
      <div className="intel-proj-grid">
        <div className="intel-proj-item">
          <div className="intel-proj-label">@ Eclipse</div>
          <div className="intel-proj-value" style={{ color: eclColor }}>
            {data.projected_next_eclipse}%
          </div>
          <div className="intel-proj-sub">
            in {data.time_to_next_eclipse_min?.toFixed(0) || '?'}m
          </div>
        </div>
        <div className="intel-proj-item">
          <div className="intel-proj-label">@ Orbit End</div>
          <div className="intel-proj-value" style={{ color: orbColor }}>
            {data.projected_next_orbit}%
          </div>
        </div>
      </div>
      {data.power_warning && (
        <div className="intel-warning">
          <AlertTriangle size={10} />
          {data.warning_reason}
        </div>
      )}
    </div>
  );
}

export default function Telemetry({ telemetry }) {
  const [powerData, setPowerData] = useState(null);
  const [powerExpanded, setPowerExpanded] = useState(false);
  const [storageExpanded, setStorageExpanded] = useState(false);

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

  useEffect(() => {
    const fetchPower = () => {
      api.getPowerPrediction().then(data => {
        if (data && data.prediction_points) setPowerData(data);
      });
    };
    fetchPower();
    const id = setInterval(fetchPower, 30000);
    return () => clearInterval(id);
  }, []);

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

  const drainChartData = powerData?.prediction_points?.map(p => ({
    t: p.time_offset_min,
    soc: p.soc_pct,
    load: p.load_consumption_w,
    solar: p.solar_generation_w,
    taskLoad: p.task_load_w,
  })) || [];

  const storageChartData = powerData?.storage_prediction_points?.map(p => ({
    t: p.time_offset_min,
    used: p.storage_used_gb,
    pct: p.storage_pct,
  })) || [];

  return (
    <div className="sidebar">
      {/* ── INTELLIGENCE LAYER (top) ── */}
      <AutonomyPanel />
      <ConstraintsPanel />
      <PowerProjectionPanel />

      {/* ── TELEMETRY (below) ── */}
      {/* Power System - Expandable */}
      <div className="sidebar-section">
        <div
          className="section-header section-header-clickable"
          onClick={() => setPowerExpanded(prev => !prev)}
        >
          <div className="section-title">
            <Battery size={14} /> Power System
          </div>
          <div className="section-toggle">
            {powerExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
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

        {powerExpanded && drainChartData.length > 0 && (
          <div className="expand-chart-area">
            <div className="expand-chart-title">
              <Zap size={11} /> SOC Drain Prediction (90 min)
            </div>
            <div style={{ height: 130 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={drainChartData}>
                  <defs>
                    <linearGradient id="socGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#64748b' }} tickFormatter={v => `${v}m`} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#64748b' }} tickFormatter={v => `${v}%`} width={32} />
                  <Tooltip content={<ChartTooltipContent />} />
                  <ReferenceLine y={20} stroke="#ef4444" strokeDasharray="3 3" />
                  <Area type="monotone" dataKey="soc" name="SOC" stroke="#22d3ee" fill="url(#socGrad)" strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="expand-chart-title" style={{ marginTop: 10 }}>Load vs Generation (W)</div>
            <div style={{ height: 100 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={drainChartData}>
                  <defs>
                    <linearGradient id="solarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="loadGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#64748b' }} tickFormatter={v => `${v}m`} />
                  <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickFormatter={v => `${v}W`} width={32} />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Area type="stepAfter" dataKey="solar" name="Solar" stroke="#22c55e" fill="url(#solarGrad)" strokeWidth={1.2} dot={false} />
                  <Area type="stepAfter" dataKey="load" name="Load" stroke="#ef4444" fill="url(#loadGrad)" strokeWidth={1.2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="expand-chart-stats">
              <span>Min SOC: <b>{powerData.min_soc_pct}%</b></span>
              <span>Margin: <b>{powerData.power_margin_wh} Wh</b></span>
              {powerData.has_scheduled_tasks && <span className="task-badge">TASKS LOADED</span>}
            </div>
          </div>
        )}
      </div>

      {/* Data Storage - Expandable */}
      <div className="sidebar-section">
        <div
          className="section-header section-header-clickable"
          onClick={() => setStorageExpanded(prev => !prev)}
        >
          <div className="section-title">
            <Database size={14} /> Data Storage
          </div>
          <div className="section-toggle">
            {storageExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>

        <div className="telem-card full-width">
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

        {storageExpanded && storageChartData.length > 0 && (
          <div className="expand-chart-area">
            <div className="expand-chart-title">
              <Database size={11} /> Storage Fill Prediction (90 min)
            </div>
            <div style={{ height: 130 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={storageChartData}>
                  <defs>
                    <linearGradient id="storageGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#64748b' }} tickFormatter={v => `${v}m`} />
                  <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickFormatter={v => `${v}G`} width={32} />
                  <Tooltip content={<ChartTooltipContent />} />
                  <ReferenceLine y={powerData?.max_storage_gb * 0.9} stroke="#ef4444" strokeDasharray="3 3" />
                  <Area type="monotone" dataKey="used" name="Used" stroke="#a855f7" fill="url(#storageGrad)" strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="expand-chart-stats">
              <span>Current: <b>{telemetry.storage_used_gb} GB</b></span>
              <span>Capacity: <b>{telemetry.max_storage_gb} GB</b></span>
              {powerData?.has_scheduled_tasks && <span className="task-badge">TASKS LOADED</span>}
            </div>
          </div>
        )}
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
              <Sparkline data={historyRef.current.bus_voltage} color="#22c55e" />
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
              <Sparkline data={historyRef.current.panel_temp} color="#22d3ee" />
            </div>
          </div>
          <div className="telem-card telem-card-spark">
            <div className="telem-spark-top">
              <div>
                <div className="telem-label">Batt Temp</div>
                <div className="telem-value cyan" style={{ fontSize: '0.9rem' }}>{telemetry.battery_temp_c}<span className="telem-unit">°C</span></div>
              </div>
              <Sparkline data={historyRef.current.battery_temp} color="#22d3ee" />
            </div>
          </div>
          <div className="telem-card telem-card-spark">
            <div className="telem-spark-top">
              <div>
                <div className="telem-label">SNR</div>
                <div className="telem-value green" style={{ fontSize: '0.9rem' }}>{telemetry.snr_db}<span className="telem-unit">dB</span></div>
              </div>
              <Sparkline data={historyRef.current.snr} color="#22c55e" />
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

      {/* TLE Quick Load */}
      <div className="sidebar-section">
        <div className="section-header">
          <div className="section-title"><Radio size={14} /> TLE Source</div>
        </div>
        <TLEQuickLoad />
      </div>

      {/* ECI State */}
      <div className="sidebar-section">
        <div className="section-header">
          <div className="section-title"><Gauge size={14} /> ECI State</div>
        </div>
        <div className="eci-grid">
          <span className="eci-lbl">R</span>
          <span className="eci-val cyan">{telemetry.position_eci[0].toFixed(1)}</span>
          <span className="eci-val cyan">{telemetry.position_eci[1].toFixed(1)}</span>
          <span className="eci-val cyan">{telemetry.position_eci[2].toFixed(1)}</span>
          <span className="eci-unit">km</span>
          <span className="eci-lbl">V</span>
          <span className="eci-val purple">{telemetry.velocity_eci[0].toFixed(4)}</span>
          <span className="eci-val purple">{telemetry.velocity_eci[1].toFixed(4)}</span>
          <span className="eci-val purple">{telemetry.velocity_eci[2].toFixed(4)}</span>
          <span className="eci-unit">km/s</span>
        </div>
      </div>
    </div>
  );
}
