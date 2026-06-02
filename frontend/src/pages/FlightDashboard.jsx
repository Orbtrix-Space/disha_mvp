import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Radio, Wifi, WifiOff, Gauge, Zap, Target,
  Globe, Clock, Sun, Moon, Satellite, Eye, Wind, Shield,
  TrendingUp, TrendingDown, Minus, AlertTriangle, Activity,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer,
  ReferenceLine, Tooltip, CartesianGrid,
} from 'recharts';
import { api } from '../services/api';

/* ── Shared ── */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">T+{label}m</div>
      {payload.map((p, i) => (
        <div key={i} className="chart-tooltip-row">
          <span style={{ color: p.color }}>{p.name}:</span>{' '}
          <span>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

function Spark({ data, color, height = 60, label, unit, decimals = 1, warn, crit }) {
  if (!data || data.length < 2) return <div className="flt-spark-empty" style={{ height }} />;
  const W = 200;
  const cur = data[data.length - 1];
  const prev = data.length > 10 ? data[data.length - 11] : data[0];
  let mn = Math.min(...data), mx = Math.max(...data);
  if (warn != null) { if (warn < mn) mn = warn - 1; if (warn > mx) mx = warn + 1; }
  if (crit != null) { if (crit < mn) mn = crit - 1; if (crit > mx) mx = crit + 1; }
  const rng = mx - mn || 1;
  const toY = v => height - 3 - ((v - mn) / rng) * (height - 6);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${toY(v)}`).join(' ');
  const diff = cur - prev;
  const TI = Math.abs(diff) < 0.001 ? Minus : diff > 0 ? TrendingUp : TrendingDown;
  const tc = Math.abs(diff) < 0.001 ? '#555' : diff > 0 ? '#5eead4' : '#ef4444';

  return (
    <div className="flt-spark-panel">
      <div className="flt-spark-header">
        <span className="flt-spark-label">{label}</span>
        <div className="flt-spark-right">
          <TI size={10} style={{ color: tc }} />
          <span className="flt-spark-value" style={{ color }}>{cur.toFixed(decimals)}<span className="flt-spark-unit">{unit}</span></span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" className="flt-spark-svg">
        {warn != null && <line x1="0" y1={toY(warn)} x2={W} y2={toY(warn)} stroke="#eab308" strokeWidth="0.8" strokeDasharray="4,4" opacity="0.4" />}
        {crit != null && <line x1="0" y1={toY(crit)} x2={W} y2={toY(crit)} stroke="#ef4444" strokeWidth="0.8" strokeDasharray="4,4" opacity="0.4" />}
        <polygon points={`0,${height} ${pts} ${W},${height}`} fill={color} opacity="0.08" />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
        <circle cx={W} cy={toY(cur)} r="3" fill={color} />
      </svg>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   LEFT COLUMN
   ═══════════════════════════════════════════════════ */
function TLEQuickLoad() {
  const [loading, setLoading] = useState(false);
  const [noradInput, setNoradInput] = useState('');
  const [loadedSat, setLoadedSat] = useState(null);
  const [error, setError] = useState(null);
  const [tleInfo, setTleInfo] = useState(null);
  const SATS = [
    { name: 'ISS', norad: 25544 }, { name: 'NOAA 19', norad: 33591 },
    { name: 'Landsat 9', norad: 49260 }, { name: 'Hubble', norad: 20580 },
    { name: 'CARTOSAT-2', norad: 31784 }, { name: 'Aqua', norad: 27424 },
  ];

  useEffect(() => {
    api.getCurrentTLE().then(d => { if (d?.satellite_name) { setTleInfo(d); setLoadedSat(d.satellite_name); } });
  }, []);

  const load = async (id, name) => {
    setLoading(true); setError(null);
    const r = await api.loadTLE(id);
    if (r?.status === 'SUCCESS' && r.tle) { setLoadedSat(r.tle.satellite_name || name); setTleInfo(r.tle); }
    else setError(r?.message || 'Failed');
    setLoading(false);
  };

  return (
    <div className="flt2-card">
      <div className="flt2-header"><Radio size={13} /> TLE SOURCE</div>
      <div className="flt2-body">
        <div className="tle-custom-input">
          <input className="form-input flt2-input" type="text" value={noradInput}
            onChange={e => setNoradInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { const id = parseInt(noradInput, 10); if (id > 0) { load(id); setNoradInput(''); } } }}
            placeholder="NORAD ID" disabled={loading} />
          <button className="quick-city-btn flt2-btn" onClick={() => { const id = parseInt(noradInput, 10); if (id > 0) { load(id); setNoradInput(''); } }}
            disabled={loading || !noradInput.trim()}><Radio size={10} /> LOAD</button>
        </div>
        <div className="quick-select-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          {SATS.map(s => (
            <button key={s.norad} className="quick-city-btn flt2-btn" onClick={() => load(s.norad, s.name)} disabled={loading}>
              <Radio size={9} /> {s.name}
            </button>
          ))}
        </div>
        {loadedSat && !error && <div className="flight-status-ok">{loadedSat}</div>}
        {error && <div className="flight-status-err">{error}</div>}
        {tleInfo?.epoch && <div className="flight-tle-meta"><span>Epoch: {tleInfo.epoch}</span>{tleInfo.norad_id && <span>NORAD: {tleInfo.norad_id}</span>}</div>}
      </div>
    </div>
  );
}

function GroundNetwork({ onNetworkChange }) {
  const [active, setActive] = useState('ISRO');
  const [loading, setLoading] = useState(false);
  const [stations, setStations] = useState([]);
  const NETS = ['NONE', 'ISRO', 'NASA', 'ESA', 'KSAT', 'GLOBAL'];

  useEffect(() => { api.getGroundStations().then(d => { if (d) { setStations(d.stations || []); if (d.network) setActive(d.network); } }); }, []);

  const select = async (id) => {
    if (id === active || loading) return;
    setLoading(true);
    const r = await api.setGroundStations(id);
    if (r?.status === 'SUCCESS') { setActive(id); setStations(r.stations || []); onNetworkChange?.(id); }
    setLoading(false);
  };

  return (
    <div className="flt2-card">
      <div className="flt2-header"><Wifi size={13} /> GROUND NETWORK <span className="flt2-badge">{stations.length}</span></div>
      <div className="flt2-body">
        <div className="quick-select-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          {NETS.map(n => (
            <button key={n} className={`quick-city-btn flt2-btn ${active === n ? (n === 'NONE' ? 'active-none' : 'active-network') : ''}`}
              onClick={() => select(n)} disabled={loading}>
              {n === 'NONE' ? <WifiOff size={9} /> : <Radio size={9} />} {n}
            </button>
          ))}
        </div>
        {stations.length > 0 && (
          <div className="flight-station-list">
            {stations.slice(0, 6).map((s, i) => (
              <div key={i} className="flight-station-row">
                <span className="flight-station-dot" />
                <span className="flight-station-name">{s.name}</span>
                <span className="flight-station-coord">{s.lat?.toFixed(1)}, {s.lon?.toFixed(1)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   CENTER — FLIGHT INSIGHTS
   ═══════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════
   CONJUNCTION + RPO + MULTI-OBJECT ANALYTICS
   ═══════════════════════════════════════════════════ */

const TRACKED_OBJECTS = [
  { id: 'OBJ-1', name: 'COSMOS 2251 DEB', tca_min: 134, miss_km: 4.8, rel_vel: 11.2, risk: 'LOW', plane: 'Co-planar' },
  { id: 'OBJ-2', name: 'STARLINK-2145', tca_min: 287, miss_km: 1.2, rel_vel: 14.7, risk: 'MEDIUM', plane: 'Cross-track' },
  { id: 'OBJ-3', name: 'CZ-2C DEB', tca_min: 412, miss_km: 8.3, rel_vel: 9.1, risk: 'LOW', plane: 'Along-track' },
];

const RISK_COLORS = { LOW: '#5eead4', MEDIUM: '#eab308', HIGH: '#ef4444' };

/* Conjunction + Evolution graph */
function ConjunctionPanel() {
  const primary = TRACKED_OBJECTS[0];
  const secondary = TRACKED_OBJECTS[1];

  // Evolution: distance over time for both objects (72-hour window, sampled)
  const evolution = useMemo(() => {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i * 3; // hours * 3 = every 3 hours, 72h window compressed
      const d1 = primary.miss_km + Math.abs(t - primary.tca_min / 60) * 2.5 + Math.pow((t - primary.tca_min / 60) / 3, 2);
      const d2 = secondary.miss_km + Math.abs(t - secondary.tca_min / 60) * 1.8 + Math.pow((t - secondary.tca_min / 60) / 4, 2);
      pts.push({ t, obj1: Math.round(Math.min(50, d1) * 10) / 10, obj2: Math.round(Math.min(50, d2) * 10) / 10 });
    }
    return pts;
  }, []);

  return (
    <div className="flt2-card flt2-conjunction">
      <div className="flt2-header">
        <AlertTriangle size={13} /> CONJUNCTION ANALYSIS
        <span className="flt2-badge" style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>{TRACKED_OBJECTS.length} objects</span>
      </div>
      <div className="flt2-body">
        {/* Primary + secondary threat cards */}
        <div className="flt2-conj-cards">
          {[primary, secondary].map((obj, i) => (
            <div key={i} className="flt2-conj-item" style={{ borderLeftColor: RISK_COLORS[obj.risk] }}>
              <div className="flt2-conj-row">
                <span className="flt2-conj-name">{obj.name}</span>
                <span className="flt2-conj-risk" style={{ color: RISK_COLORS[obj.risk], borderColor: RISK_COLORS[obj.risk] }}>{obj.risk}</span>
              </div>
              <div className="flt2-conj-details">
                <span>TCA: <b>+{Math.floor(obj.tca_min / 60)}h {obj.tca_min % 60}m</b></span>
                <span>Miss: <b>{obj.miss_km} km</b></span>
                <span>Vrel: <b>{obj.rel_vel} km/s</b></span>
              </div>
            </div>
          ))}
        </div>

        {/* Evolution graph — distance over time for both objects */}
        <div className="flt2-conj-evo-label">CONJUNCTION EVOLUTION (72h)</div>
        <div style={{ height: 70 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={evolution}>
              <defs>
                <linearGradient id="conjG1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#eab308" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="conjG2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
              <XAxis dataKey="t" tick={{ fontSize: 7, fill: '#555' }} tickFormatter={v => `${v}h`} />
              <YAxis tick={{ fontSize: 7, fill: '#555' }} width={20} tickFormatter={v => `${v}`} />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={5} stroke="#ef4444" strokeDasharray="3 3" label={{ value: '5km', fontSize: 7, fill: '#ef4444' }} />
              <Area type="monotone" dataKey="obj1" name={primary.name.slice(0, 12)} stroke="#eab308" fill="url(#conjG1)" strokeWidth={1.5} dot={false} />
              <Area type="monotone" dataKey="obj2" name={secondary.name.slice(0, 12)} stroke="#ef4444" fill="url(#conjG2)" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* RPO — Relative Proximity Operations */
function RPOPanel() {
  const primary = TRACKED_OBJECTS[1]; // Highest risk object

  // Relative distance curve centered at TCA
  const rpoCurve = useMemo(() => {
    const pts = [];
    for (let i = 0; i <= 30; i++) {
      const tMin = (i - 15) * 4; // -60 to +60 min around TCA
      const dist = primary.miss_km + Math.abs(tMin) * 0.3 + (tMin * tMin) / 800;
      const relV = primary.rel_vel * (1 - Math.exp(-Math.abs(tMin) / 30));
      pts.push({ t: tMin, dist: Math.round(dist * 100) / 100, vel: Math.round(relV * 100) / 100 });
    }
    return pts;
  }, []);

  const isConverging = true; // Before TCA

  return (
    <div className="flt2-card">
      <div className="flt2-header"><Target size={13} /> RPO — RELATIVE MOTION</div>
      <div className="flt2-body">
        <div className="flt2-rpo-info">
          <div className="flt2-rpo-target">
            <span className="flt2-rpo-label">Target</span>
            <span className="flt2-rpo-val">{primary.name}</span>
          </div>
          <div className="flt2-rpo-metrics">
            <div className="flt2-rpo-metric">
              <span className="flt2-rpo-mlabel">ΔR</span>
              <span className="flt2-rpo-mval">{primary.miss_km} km</span>
            </div>
            <div className="flt2-rpo-metric">
              <span className="flt2-rpo-mlabel">ΔV</span>
              <span className="flt2-rpo-mval">{primary.rel_vel} km/s</span>
            </div>
            <div className="flt2-rpo-metric">
              <span className="flt2-rpo-mlabel">Class</span>
              <span className="flt2-rpo-mval" style={{ color: isConverging ? '#ef4444' : '#5eead4' }}>
                {isConverging ? 'CONVERGING' : 'DIVERGING'}
              </span>
            </div>
            <div className="flt2-rpo-metric">
              <span className="flt2-rpo-mlabel">Plane</span>
              <span className="flt2-rpo-mval">{primary.plane}</span>
            </div>
          </div>
        </div>

        {/* RPO distance vs time graph */}
        <div style={{ height: 65 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rpoCurve}>
              <defs>
                <linearGradient id="rpoGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
              <XAxis dataKey="t" tick={{ fontSize: 7, fill: '#555' }} tickFormatter={v => `${v > 0 ? '+' : ''}${v}m`} />
              <YAxis tick={{ fontSize: 7, fill: '#555' }} width={20} />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine x={0} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="3 3" label={{ value: 'TCA', fontSize: 8, fill: '#ef4444' }} />
              <Area type="monotone" dataKey="dist" name="Dist(km)" stroke="#a855f7" fill="url(#rpoGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* Multi-Object Tracking */
function MultiObjectTracking() {
  return (
    <div className="flt2-card">
      <div className="flt2-header"><Satellite size={13} /> TRACKED OBJECTS <span className="flt2-badge">{TRACKED_OBJECTS.length}</span></div>
      <div className="flt2-body">
        <div className="flt2-mot-list">
          {TRACKED_OBJECTS.map((obj, i) => {
            // Mini trend per object (approach curve)
            const miniData = [];
            for (let j = 0; j <= 10; j++) {
              const t = j * 6;
              miniData.push(obj.miss_km + Math.abs(t - obj.tca_min / 60) * 1.5);
            }
            const minDist = Math.min(...miniData);
            const maxDist = Math.max(...miniData);
            const range = maxDist - minDist || 1;

            return (
              <div key={obj.id} className="flt2-mot-item">
                <div className="flt2-mot-dot" style={{ background: RISK_COLORS[obj.risk] }} />
                <div className="flt2-mot-info">
                  <span className="flt2-mot-name">{obj.name}</span>
                  <span className="flt2-mot-meta">
                    +{Math.floor(obj.tca_min / 60)}h{obj.tca_min % 60}m · {obj.miss_km}km
                  </span>
                </div>
                <span className="flt2-mot-risk" style={{ color: RISK_COLORS[obj.risk] }}>{obj.risk}</span>
                {/* Mini sparkline */}
                <svg width={40} height={16} viewBox="0 0 40 16" className="flt2-mot-spark">
                  <polyline
                    points={miniData.map((v, j) => `${j * 4},${14 - ((v - minDist) / range) * 12}`).join(' ')}
                    fill="none" stroke={RISK_COLORS[obj.risk]} strokeWidth="1.5" strokeLinecap="round"
                  />
                </svg>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* Orbit Health */
function OrbitHealth({ telemetry }) {
  const [lastUpdate] = useState(Date.now());
  const elapsed = Math.round((Date.now() - lastUpdate) / 1000);

  const altHist = useRef([]);
  useEffect(() => {
    if (!telemetry?.altitude_km) return;
    altHist.current.push(telemetry.altitude_km);
    if (altHist.current.length > 60) altHist.current.shift();
  }, [telemetry]);

  const altStable = altHist.current.length > 5 &&
    Math.abs(altHist.current[altHist.current.length - 1] - altHist.current[0]) < 5;

  return (
    <div className="flt2-card">
      <div className="flt2-header"><Shield size={13} /> ORBIT HEALTH</div>
      <div className="flt2-body">
        <div className="flt2-health-grid">
          <div className="flt2-health-item">
            <span className="flt2-health-label">Propagation</span>
            <span className="flt2-health-val nominal">NOMINAL</span>
          </div>
          <div className="flt2-health-item">
            <span className="flt2-health-label">Last Update</span>
            <span className="flt2-health-val">{elapsed < 5 ? 'LIVE' : `${elapsed}s ago`}</span>
          </div>
          <div className="flt2-health-item">
            <span className="flt2-health-label">Confidence</span>
            <span className="flt2-health-val nominal">HIGH</span>
          </div>
          <div className="flt2-health-item">
            <span className="flt2-health-label">Covariance</span>
            <span className="flt2-health-val nominal">LOW</span>
          </div>
        </div>
        {/* Stability sparkline */}
        <Spark data={altHist.current} color={altStable ? '#5eead4' : '#eab308'} height={35} label="Stability" unit=" km" decimals={1} />
      </div>
    </div>
  );
}

/* Visibility Summary */
function VisibilitySummary({ telemetry }) {
  const [passes, setPasses] = useState([]);
  const [proj, setProj] = useState(null);

  useEffect(() => {
    const fetch = () => {
      api.getGroundStationPasses().then(d => { if (d?.passes) setPasses(d.passes); });
      api.getPowerProjection().then(d => { if (d) setProj(d); });
    };
    fetch();
    const id = setInterval(fetch, 30000);
    return () => clearInterval(id);
  }, []);

  const nextPass = useMemo(() => {
    const now = Date.now();
    return passes.find(p => new Date(p.aos_time).getTime() > now);
  }, [passes]);

  const aosMin = nextPass ? Math.round((new Date(nextPass.aos_time).getTime() - Date.now()) / 60000) : null;
  const eclMin = proj?.time_to_next_eclipse_min != null ? Math.round(proj.time_to_next_eclipse_min) : null;

  // Elevation curve
  const elevData = useMemo(() => {
    if (!nextPass) return [];
    const dur = nextPass.duration_sec || 300;
    const maxEl = nextPass.max_elevation_deg || 30;
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      pts.push({ t: Math.round(t * dur), el: Math.round(maxEl * Math.sin(t * Math.PI)) });
    }
    return pts;
  }, [nextPass]);

  return (
    <div className="flt2-card">
      <div className="flt2-header"><Eye size={13} /> VISIBILITY</div>
      <div className="flt2-body">
        <div className="flt2-vis-grid">
          <div className="flt2-vis-item">
            <span className="flt2-vis-label">Next AOS</span>
            <span className="flt2-vis-val">{aosMin != null ? `+${aosMin}m` : '—'}</span>
          </div>
          <div className="flt2-vis-item">
            <span className="flt2-vis-label">Max Elev</span>
            <span className="flt2-vis-val cyan">{nextPass?.max_elevation_deg || '—'}°</span>
          </div>
          <div className="flt2-vis-item">
            <span className="flt2-vis-label">Station</span>
            <span className="flt2-vis-val">{nextPass?.station_name?.replace('ISTRAC ', '') || '—'}</span>
          </div>
          <div className="flt2-vis-item">
            <span className="flt2-vis-label">Eclipse in</span>
            <span className="flt2-vis-val" style={{ color: eclMin != null && eclMin < 15 ? '#eab308' : '#888' }}>
              {eclMin != null ? `${eclMin}m` : '—'}
            </span>
          </div>
        </div>
        {elevData.length > 1 && (
          <div style={{ height: 50 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={elevData}>
                <defs>
                  <linearGradient id="elevG2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#5eead4" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#5eead4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" tick={{ fontSize: 7, fill: '#555' }} tickFormatter={v => `${v}s`} />
                <YAxis tick={{ fontSize: 7, fill: '#555' }} width={16} />
                <Area type="monotone" dataKey="el" stroke="#5eead4" fill="url(#elevG2)" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   RIGHT COLUMN
   ═══════════════════════════════════════════════════ */
const SV_MAX = 120;

function StateVectorPanel({ telemetry }) {
  const h = useRef({ rx: [], ry: [], rz: [], vx: [], vy: [], vz: [] });

  useEffect(() => {
    if (!telemetry?.position_eci) return;
    const d = h.current;
    const push = (a, v) => { a.push(v); if (a.length > SV_MAX) a.shift(); };
    push(d.rx, telemetry.position_eci[0]); push(d.ry, telemetry.position_eci[1]); push(d.rz, telemetry.position_eci[2]);
    push(d.vx, telemetry.velocity_eci[0]); push(d.vy, telemetry.velocity_eci[1]); push(d.vz, telemetry.velocity_eci[2]);
  }, [telemetry]);

  if (!telemetry?.position_eci) return null;
  const H = 55;

  return (
    <div className="flt2-card flt2-sv">
      <div className="flt2-header"><Gauge size={13} /> STATE VECTOR</div>
      <div className="flt2-body">
        <div className="flt2-sv-section">
          <div className="flt2-sv-label">POSITION (ECI)</div>
          <div className="flt2-sv-grid">
            <Spark data={h.current.rx} color="#2dd4bf" height={H} label="Rx" unit=" km" decimals={1} />
            <Spark data={h.current.ry} color="#5eead4" height={H} label="Ry" unit=" km" decimals={1} />
            <Spark data={h.current.rz} color="#99f6e4" height={H} label="Rz" unit=" km" decimals={1} />
          </div>
        </div>
        <div className="flt2-sv-section">
          <div className="flt2-sv-label">VELOCITY (ECI)</div>
          <div className="flt2-sv-grid">
            <Spark data={h.current.vx} color="#0d9488" height={H} label="Vx" unit=" km/s" decimals={3} />
            <Spark data={h.current.vy} color="#14b8a6" height={H} label="Vy" unit=" km/s" decimals={3} />
            <Spark data={h.current.vz} color="#2dd4bf" height={H} label="Vz" unit=" km/s" decimals={3} />
          </div>
        </div>
        <div className="flt2-geo-row">
          <span>LAT <b>{telemetry.latitude.toFixed(4)}°</b></span>
          <span>LON <b>{telemetry.longitude.toFixed(4)}°</b></span>
          <span>ALT <b>{telemetry.altitude_km.toFixed(1)} km</b></span>
          <span>VEL <b>{telemetry.speed_km_s.toFixed(2)} km/s</b></span>
        </div>
      </div>
    </div>
  );
}

function PowerPanel({ telemetry }) {
  const [pd, setPd] = useState(null);
  const [proj, setProj] = useState(null);

  useEffect(() => {
    const fetch = () => {
      api.getPowerPrediction().then(d => { if (d?.prediction_points) setPd(d); });
      api.getPowerProjection().then(d => { if (d) setProj(d); });
    };
    fetch();
    const id = setInterval(fetch, 30000);
    return () => clearInterval(id);
  }, []);

  const drainData = pd?.prediction_points?.map(p => ({ t: p.time_offset_min, soc: p.soc_pct })) || [];
  const insight = useMemo(() => {
    if (!pd) return '';
    if (pd.min_soc_pct < 20) return 'SOC will breach critical threshold';
    if (telemetry?.in_eclipse) return 'In eclipse — battery discharging';
    if (proj?.time_to_next_eclipse_min < 10) return `Eclipse entry in ~${Math.round(proj.time_to_next_eclipse_min)}m`;
    return 'Stable above margin';
  }, [pd, proj, telemetry?.in_eclipse]);

  return (
    <div className="flt2-card">
      <div className="flt2-header"><Zap size={13} /> POWER</div>
      <div className="flt2-body">
        {drainData.length > 0 ? (
          <>
            <div style={{ height: 70 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={drainData}>
                  <defs>
                    <linearGradient id="socGF3" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                  <XAxis dataKey="t" tick={{ fontSize: 8, fill: '#555' }} tickFormatter={v => `${v}m`} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 8, fill: '#555' }} width={22} tickFormatter={v => `${v}%`} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={20} stroke="#ef4444" strokeDasharray="3 3" />
                  <Area type="monotone" dataKey="soc" name="SOC" stroke="#2dd4bf" fill="url(#socGF3)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flt2-power-row">
              <span>Min: <b>{pd.min_soc_pct}%</b></span>
              <span>Margin: <b>{pd.power_margin_wh} Wh</b></span>
              <span style={{ color: telemetry?.in_eclipse ? '#f59e0b' : '#5eead4' }}>
                {telemetry?.in_eclipse ? '● ECLIPSE' : '● SUNLIT'}
              </span>
            </div>
            <div className="flt2-insight">{insight}</div>
          </>
        ) : <div className="flt2-empty">Loading...</div>}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   BOTTOM ROW
   ═══════════════════════════════════════════════════ */
function OrbitalElements() {
  const [el, setEl] = useState(null);
  const prevRef = useRef(null);

  useEffect(() => {
    const fetch = () => api.getOrbitalElements().then(d => { if (d) { prevRef.current = el; setEl(d); } });
    fetch();
    const id = setInterval(fetch, 5000);
    return () => clearInterval(id);
  }, []);

  if (!el) return null;

  const trend = (key) => {
    if (!prevRef.current) return 'stable';
    const c = el[key], p = prevRef.current[key];
    if (c == null || p == null) return 'stable';
    const d = c - p;
    if (Math.abs(d) < 0.0001) return 'stable';
    return d > 0 ? 'up' : 'down';
  };

  const TI = ({ dir }) => {
    if (dir === 'up') return <TrendingUp size={10} style={{ color: '#5eead4' }} />;
    if (dir === 'down') return <TrendingDown size={10} style={{ color: '#ef4444' }} />;
    return <Minus size={10} style={{ color: '#333' }} />;
  };

  const items = [
    { sym: 'a', label: 'Semi-major axis', val: el.semi_major_axis_km?.toFixed(1), unit: 'km', k: 'semi_major_axis_km' },
    { sym: 'e', label: 'Eccentricity', val: el.eccentricity?.toFixed(6), unit: '', k: 'eccentricity' },
    { sym: 'i', label: 'Inclination', val: el.inclination_deg?.toFixed(3), unit: '°', k: 'inclination_deg' },
    { sym: 'Ω', label: 'RAAN', val: el.raan_deg?.toFixed(3), unit: '°', k: 'raan_deg' },
    { sym: 'ω', label: 'Arg. Perigee', val: el.arg_periapsis_deg?.toFixed(3), unit: '°', k: 'arg_periapsis_deg' },
    { sym: 'ν', label: 'True Anomaly', val: el.true_anomaly_deg?.toFixed(3), unit: '°', k: 'true_anomaly_deg' },
  ];

  return (
    <div className="flt2-card">
      <div className="flt2-header"><Globe size={13} /> ORBITAL ELEMENTS</div>
      <div className="flt2-body">
        <div className="flt2-oe-grid">
          {items.map(e => (
            <div key={e.sym} className="flt2-oe-item">
              <span className="flt2-oe-sym">{e.sym}</span>
              <div className="flt2-oe-data">
                <span className="flt2-oe-label">{e.label}</span>
                <span className="flt2-oe-val">{e.val}<span className="flt2-oe-unit">{e.unit}</span> <TI dir={trend(e.k)} /></span>
              </div>
            </div>
          ))}
        </div>
        {el.period_min && <div className="flt2-oe-period">Period: <b>{el.period_min.toFixed(1)} min</b></div>}
      </div>
    </div>
  );
}

function EventTimeline({ telemetry }) {
  const [passes, setPasses] = useState([]);
  const [proj, setProj] = useState(null);

  useEffect(() => {
    const fetch = () => {
      api.getGroundStationPasses().then(d => { if (d?.passes) setPasses(d.passes); });
      api.getPowerProjection().then(d => { if (d) setProj(d); });
    };
    fetch();
    const id = setInterval(fetch, 30000);
    return () => clearInterval(id);
  }, []);

  const events = useMemo(() => {
    const items = [];
    const now = Date.now();
    if (proj?.time_to_next_eclipse_min != null && proj.time_to_next_eclipse_min < 90)
      items.push({ time: Math.round(proj.time_to_next_eclipse_min), label: telemetry?.in_eclipse ? 'Eclipse Exit' : 'Eclipse Entry', type: 'eclipse' });
    for (const p of passes.slice(0, 5)) {
      const diff = Math.round((new Date(p.aos_time).getTime() - now) / 60000);
      if (diff > 0 && diff < 180) items.push({ time: diff, label: p.station_name.replace('ISTRAC ', ''), type: 'contact' });
    }
    // Conjunction marker
    items.push({ time: 134, label: 'Conjunction TCA', type: 'conjunction' });
    items.sort((a, b) => a.time - b.time);
    return items.slice(0, 7);
  }, [passes, proj, telemetry?.in_eclipse]);

  return (
    <div className="flt2-card flt2-timeline">
      <div className="flt2-header"><Clock size={13} /> EVENT TIMELINE</div>
      <div className="flt2-body">
        {events.length === 0 ? <div className="flt2-empty">No events</div> : (
          <div className="flt2-evt-list">
            {events.map((ev, i) => (
              <div key={i} className={`flt2-evt ${ev.type}`}>
                <div className="flt2-evt-dot" />
                {i < events.length - 1 && <div className="flt2-evt-line" />}
                <span className="flt2-evt-time">+{ev.time}m</span>
                <span className="flt2-evt-label">{ev.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Maneuver & ΔV Planner
   ═══════════════════════════════════════════════════ */
const MANEUVER_TYPES = ['Orbit Raise', 'Plane Change', 'Phasing', 'Deorbit', 'Station Keeping'];
const STATUS_COLORS = { PLANNED: '#eab308', READY: '#5eead4', EXECUTING: '#f97316', COMPLETED: '#555' };

function ManeuverPlanner() {
  // Deterministic placeholder maneuver data
  const [maneuver] = useState(() => ({
    type: 'Orbit Raise',
    scheduled: new Date(Date.now() + 4800000).toISOString(), // +80min
    dv_ms: 2.35,
    burn_sec: 45,
    thruster: 'RCS-1 (1N)',
    status: 'PLANNED',
  }));

  const [budget] = useState({ total: 120, used: 14.8 });
  const remaining = budget.total - budget.used;
  const usedPct = (budget.used / budget.total) * 100;

  // Countdown
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const schedMs = new Date(maneuver.scheduled).getTime();
  const diffSec = Math.max(0, Math.round((schedMs - now) / 1000));
  const countdownStr = `${String(Math.floor(diffSec / 3600)).padStart(2, '0')}:${String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0')}:${String(diffSec % 60).padStart(2, '0')}`;

  // Transfer trajectory preview (simple SVG parabola)
  const trajW = 200;
  const trajH = 50;
  const trajPoints = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const x = t * trajW;
    const y = trajH - (4 * trajH * 0.8 * t * (1 - t)) - 4;
    trajPoints.push(`${x},${y}`);
  }

  return (
    <div className="flt2-card flt2-maneuver">
      <div className="flt2-header">
        <Zap size={12} /> MANEUVER PLANNING
        <span className="flt2-badge" style={{
          color: STATUS_COLORS[maneuver.status],
          background: `${STATUS_COLORS[maneuver.status]}15`,
        }}>{maneuver.status}</span>
      </div>
      <div className="flt2-body">
        {/* (A) Upcoming Maneuver */}
        <div className="mnv-section">
          <div className="mnv-row">
            <span className="mnv-label">Type</span>
            <span className="mnv-val">{maneuver.type}</span>
          </div>
          <div className="mnv-row">
            <span className="mnv-label">T-Burn</span>
            <span className="mnv-val mnv-countdown">{countdownStr}</span>
          </div>
          <div className="mnv-row">
            <span className="mnv-label">ΔV</span>
            <span className="mnv-val mnv-dv">{maneuver.dv_ms} m/s</span>
          </div>
          <div className="mnv-row">
            <span className="mnv-label">Duration</span>
            <span className="mnv-val">{maneuver.burn_sec}s</span>
          </div>
          <div className="mnv-row">
            <span className="mnv-label">Thruster</span>
            <span className="mnv-val">{maneuver.thruster}</span>
          </div>
        </div>

        {/* (B) ΔV Budget */}
        <div className="mnv-section mnv-budget">
          <div className="mnv-budget-header">
            <span>ΔV BUDGET</span>
            <span className="mnv-budget-remain">{remaining.toFixed(1)} m/s remaining</span>
          </div>
          <div className="mnv-budget-bar">
            <div className="mnv-budget-fill" style={{ width: `${usedPct}%` }} />
          </div>
          <div className="mnv-budget-labels">
            <span>Used: {budget.used} m/s</span>
            <span>Total: {budget.total} m/s</span>
          </div>
        </div>

        {/* (C) Transfer Preview */}
        <div className="mnv-section mnv-preview">
          <svg viewBox={`0 0 ${trajW} ${trajH}`} width="100%" height={trajH} preserveAspectRatio="none">
            {/* Orbit arcs */}
            <line x1="0" y1={trajH - 4} x2={trajW} y2={trajH - 4} stroke="#1a1a1a" strokeWidth="1" />
            <line x1="0" y1="8" x2={trajW} y2="8" stroke="#1a1a1a" strokeWidth="1" strokeDasharray="4,4" />
            {/* Transfer arc */}
            <polyline points={trajPoints.join(' ')} fill="none" stroke="#eab308" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.7" />
            {/* Burn point */}
            <circle cx="0" cy={trajH - 4} r="3" fill="#5eead4" />
            {/* Arrival */}
            <circle cx={trajW} cy="8" r="3" fill="#eab308" />
          </svg>
          <div className="mnv-preview-label">Transfer Trajectory Preview</div>
        </div>

        {/* (D) Quick Actions — placeholder hooks */}
        <div className="mnv-actions">
          <button className="mnv-action-btn">Simulate</button>
          <button className="mnv-action-btn">Optimize ΔV</button>
          <button className="mnv-action-btn mnv-action-primary">Upload</button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN DASHBOARD — refactored Flight page
   ───────────────────────────────────────────────────
   Two-section sidebar (GPS + Tracking Data) on the left.
   Fixed responsive grid on the right:
     row 1: OD block (KV grid + sparkline + residuals plot)
     row 2: Conjunction block (table + range plot + B-plane)
     row 3: Maneuver | State vector | Power
     row 4: Orbital elements | Visibility | Event timeline
   No panel toggles; no RPO; no TLE loaders in the main window.
   ═══════════════════════════════════════════════════ */
import DashboardSidebar from '../components/DashboardSidebar';
import PipelineStatusStrip from '../components/flight/PipelineStatusStrip';
import { OdBlock, ConjunctionBlock, ManeuverBlock } from '../components/flight/PipelineOutputs';

export default function FlightDashboard({ telemetry }) {
  return (
    <div className="ctrl-with-rail">
      <DashboardSidebar flightMode />
      <div className="flt-wrap">
        <PipelineStatusStrip />
        {/*
          Layout = vertical flex stack of independent rows. Each row is
          its own grid; rows CANNOT overlap each other regardless of
          row content height. This is the explicit fix for the overlap
          bug reported at 100% browser zoom.
        */}
        <div className="flt-stack">
          {/* Row 1 — Orbit determination + LSQ fit graph (headline) */}
          <div className="flt-row">
            <div className="flt-cell"><OdBlock /></div>
          </div>

          {/* Row 2 — Conjunction screening + range plot + B-plane */}
          <div className="flt-row">
            <div className="flt-cell"><ConjunctionBlock /></div>
          </div>

          {/* Row 3 — Maneuver / State vector / Power */}
          <div className="flt-row flt-row-3">
            <div className="flt-cell"><ManeuverBlock /></div>
            <div className="flt-cell"><StateVectorPanel telemetry={telemetry} /></div>
            <div className="flt-cell"><PowerPanel telemetry={telemetry} /></div>
          </div>

          {/* Row 4 — Orbital elements / Visibility / Event timeline */}
          <div className="flt-row flt-row-3">
            <div className="flt-cell"><OrbitalElements /></div>
            <div className="flt-cell"><VisibilitySummary telemetry={telemetry} /></div>
            <div className="flt-cell"><EventTimeline telemetry={telemetry} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
