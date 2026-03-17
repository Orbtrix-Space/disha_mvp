import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Radio, Wifi, WifiOff, Gauge, Zap, Database, Target,
  BatteryCharging, Navigation, Globe, Clock,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer,
  ReferenceLine, Tooltip, CartesianGrid,
} from 'recharts';
import { api } from '../services/api';

function ChartTooltipContent({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
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

/* ── TLE Quick Load ── */
function TLEQuickLoad() {
  const [loading, setLoading] = useState(false);
  const [noradInput, setNoradInput] = useState('');
  const [loadedSat, setLoadedSat] = useState(null);
  const [error, setError] = useState(null);
  const [tleInfo, setTleInfo] = useState(null);

  const QUICK_SATS = [
    { name: 'ISS', norad: 25544 },
    { name: 'NOAA 19', norad: 33591 },
    { name: 'Landsat 9', norad: 49260 },
    { name: 'Hubble', norad: 20580 },
    { name: 'CARTOSAT-2', norad: 31784 },
    { name: 'Aqua', norad: 27424 },
  ];

  useEffect(() => {
    api.getCurrentTLE().then(d => {
      if (d && d.satellite_name) {
        setTleInfo(d);
        setLoadedSat(d.satellite_name);
      }
    });
  }, []);

  const load = async (id, name) => {
    setLoading(true);
    setError(null);
    const result = await api.loadTLE(id);
    if (result && result.status === 'SUCCESS' && result.tle) {
      setLoadedSat(result.tle.satellite_name || name || `NORAD ${id}`);
      setTleInfo(result.tle);
    } else if (result && result.message) {
      setError(result.message);
    } else if (!result) {
      setError('Failed to load TLE — network error');
    }
    setLoading(false);
  };

  const handleCustomLoad = () => {
    const id = parseInt(noradInput.trim(), 10);
    if (isNaN(id) || id <= 0) { setError('Enter a valid NORAD ID'); return; }
    load(id);
    setNoradInput('');
  };

  return (
    <div className="flight-card">
      <div className="flight-card-header">
        <Radio size={14} /> TLE SOURCE
      </div>
      <div className="flight-card-body">
        {/* Custom NORAD ID input */}
        <div className="tle-custom-input">
          <input
            className="form-input"
            style={{ fontSize: '0.7rem', padding: '6px 10px', flex: 1 }}
            type="text"
            value={noradInput}
            onChange={e => setNoradInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCustomLoad()}
            placeholder="NORAD ID (e.g. 25544)"
            disabled={loading}
          />
          <button
            className="quick-city-btn"
            style={{ padding: '6px 12px', flexShrink: 0 }}
            onClick={handleCustomLoad}
            disabled={loading || !noradInput.trim()}
          >
            {loading ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <Radio size={10} />}
            LOAD
          </button>
        </div>

        <div className="quick-select-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          {QUICK_SATS.map(sat => (
            <button key={sat.norad} className="quick-city-btn" onClick={() => load(sat.norad, sat.name)} disabled={loading}>
              <Radio size={10} /> {sat.name}
            </button>
          ))}
        </div>

        {loadedSat && !error && (
          <div className="flight-status-ok">Tracking: {loadedSat}</div>
        )}
        {error && (
          <div className="flight-status-err">{error}</div>
        )}
        {tleInfo && tleInfo.epoch && (
          <div className="flight-tle-meta">
            <span>Epoch: {tleInfo.epoch}</span>
            {tleInfo.norad_id && <span>NORAD: {tleInfo.norad_id}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Ground Network Selector ── */
function GroundNetworkSelector({ onNetworkChange }) {
  const [active, setActive] = useState('ISRO');
  const [loading, setLoading] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customLat, setCustomLat] = useState('');
  const [customLon, setCustomLon] = useState('');
  const [stations, setStations] = useState([]);

  const NETWORKS = [
    { id: 'NONE', label: 'NONE', desc: 'No ground stations' },
    { id: 'ISRO', label: 'ISRO', desc: 'ISTRAC Network' },
    { id: 'NASA', label: 'NASA', desc: 'Deep Space Network' },
    { id: 'ESA', label: 'ESA', desc: 'ESTRACK Network' },
    { id: 'KSAT', label: 'KSAT', desc: 'Polar Network' },
    { id: 'GLOBAL', label: 'GLOBAL', desc: 'Combined Coverage' },
  ];

  const fetchStations = useCallback(() => {
    api.getGroundStations().then(d => {
      if (d) {
        setStations(d.stations || []);
        if (d.network) setActive(d.network);
      }
    });
  }, []);

  useEffect(() => {
    fetchStations();
  }, [fetchStations]);

  const selectNetwork = async (id) => {
    if (id === active || loading) return;
    setLoading(true);
    const result = await api.setGroundStations(id);
    if (result && result.status === 'SUCCESS') {
      setActive(id);
      setStations(result.stations || []);
      setShowCustom(false);
      if (onNetworkChange) onNetworkChange(id);
    }
    setLoading(false);
  };

  const addCustom = async () => {
    const lat = parseFloat(customLat);
    const lon = parseFloat(customLon);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return;
    const name = customName.trim() || `Custom (${lat.toFixed(2)}, ${lon.toFixed(2)})`;
    setLoading(true);
    const result = await api.addCustomStation(name, lat, lon);
    if (result && result.status === 'SUCCESS') {
      setActive('CUSTOM');
      setStations(result.stations || []);
      setCustomName(''); setCustomLat(''); setCustomLon('');
      if (onNetworkChange) onNetworkChange('CUSTOM');
    }
    setLoading(false);
  };

  return (
    <div className="flight-card">
      <div className="flight-card-header">
        <Wifi size={14} /> GROUND NETWORK
        <span className="flight-card-badge">{stations.length} stations</span>
      </div>
      <div className="flight-card-body">
        <div className="quick-select-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          {NETWORKS.map(n => (
            <button
              key={n.id}
              className={`quick-city-btn ${active === n.id ? (n.id === 'NONE' ? 'active-none' : 'active-network') : ''}`}
              onClick={() => selectNetwork(n.id)}
              disabled={loading}
              title={n.desc}
            >
              {n.id === 'NONE' ? <WifiOff size={10} /> : <Radio size={10} />}
              {n.label}
            </button>
          ))}
        </div>

        <button
          className={`quick-city-btn ${active === 'CUSTOM' ? 'active-network' : ''}`}
          style={{ width: '100%', marginTop: 4, justifyContent: 'center' }}
          onClick={() => setShowCustom(v => !v)}
        >
          <Target size={10} />
          {showCustom ? 'HIDE CUSTOM' : 'ADD CUSTOM STATION'}
        </button>

        {showCustom && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <input className="form-input" style={{ fontSize: '0.65rem', padding: '5px 8px' }} type="text"
              value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Station name (optional)" disabled={loading} />
            <div style={{ display: 'flex', gap: 4 }}>
              <input className="form-input" style={{ fontSize: '0.65rem', padding: '5px 8px', flex: 1 }} type="number"
                value={customLat} onChange={e => setCustomLat(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustom()}
                placeholder="Lat (-90 to 90)" disabled={loading} min={-90} max={90} step="any" />
              <input className="form-input" style={{ fontSize: '0.65rem', padding: '5px 8px', flex: 1 }} type="number"
                value={customLon} onChange={e => setCustomLon(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustom()}
                placeholder="Lon (-180 to 180)" disabled={loading} min={-180} max={180} step="any" />
            </div>
            <button className="quick-city-btn" style={{ width: '100%', justifyContent: 'center' }}
              onClick={addCustom} disabled={loading || !customLat || !customLon}>
              <Target size={10} /> ADD STATION
            </button>
          </div>
        )}

        {/* Station list */}
        {stations.length > 0 && (
          <div className="flight-station-list">
            {stations.map((s, i) => (
              <div key={i} className="flight-station-row">
                <span className="flight-station-dot" />
                <span className="flight-station-name">{s.name}</span>
                <span className="flight-station-coord">{s.lat?.toFixed(2)}, {s.lon?.toFixed(2)}</span>
                <span className="flight-station-country">{s.country || ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── ECI State Card ── */
function ECIStateCard({ telemetry }) {
  if (!telemetry) return null;
  return (
    <div className="flight-card">
      <div className="flight-card-header"><Gauge size={14} /> ECI STATE VECTOR</div>
      <div className="flight-card-body">
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
        <div className="flight-nav-grid" style={{ marginTop: 10 }}>
          <div className="flight-nav-item">
            <div className="flight-nav-label">LAT</div>
            <div className="flight-nav-value cyan">{telemetry.latitude.toFixed(4)}°</div>
          </div>
          <div className="flight-nav-item">
            <div className="flight-nav-label">LON</div>
            <div className="flight-nav-value cyan">{telemetry.longitude.toFixed(4)}°</div>
          </div>
          <div className="flight-nav-item">
            <div className="flight-nav-label">ALT</div>
            <div className="flight-nav-value purple">{telemetry.altitude_km.toFixed(1)} km</div>
          </div>
          <div className="flight-nav-item">
            <div className="flight-nav-label">VEL</div>
            <div className="flight-nav-value purple">{telemetry.speed_km_s.toFixed(2)} km/s</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Power Prediction Card ── */
function PowerPredictionCard() {
  const [powerData, setPowerData] = useState(null);

  useEffect(() => {
    const fetch = () => api.getPowerPrediction().then(d => { if (d && d.prediction_points) setPowerData(d); });
    fetch();
    const id = setInterval(fetch, 30000);
    return () => clearInterval(id);
  }, []);

  if (!powerData) return null;

  const drainData = powerData.prediction_points?.map(p => ({
    t: p.time_offset_min, soc: p.soc_pct, load: p.load_consumption_w, solar: p.solar_generation_w,
  })) || [];

  const storageData = powerData.storage_prediction_points?.map(p => ({
    t: p.time_offset_min, used: p.storage_used_gb, pct: p.storage_pct,
  })) || [];

  return (
    <>
      <div className="flight-card">
        <div className="flight-card-header"><Zap size={14} /> POWER PREDICTION (90 min)</div>
        <div className="flight-card-body">
          {drainData.length > 0 && (
            <>
              <div style={{ height: 140 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={drainData}>
                    <defs>
                      <linearGradient id="socGradF" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#64748b' }} tickFormatter={v => `${v}m`} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#64748b' }} tickFormatter={v => `${v}%`} width={32} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <ReferenceLine y={20} stroke="#ef4444" strokeDasharray="3 3" />
                    <Area type="monotone" dataKey="soc" name="SOC" stroke="#2dd4bf" fill="url(#socGradF)" strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="expand-chart-stats">
                <span>Min SOC: <b>{powerData.min_soc_pct}%</b></span>
                <span>Margin: <b>{powerData.power_margin_wh} Wh</b></span>
              </div>
              <div style={{ height: 110, marginTop: 12 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={drainData}>
                    <defs>
                      <linearGradient id="solarGradF" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#5eead4" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#5eead4" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="loadGradF" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#64748b' }} tickFormatter={v => `${v}m`} />
                    <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickFormatter={v => `${v}W`} width={32} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Area type="stepAfter" dataKey="solar" name="Solar" stroke="#5eead4" fill="url(#solarGradF)" strokeWidth={1.2} dot={false} />
                    <Area type="stepAfter" dataKey="load" name="Load" stroke="#ef4444" fill="url(#loadGradF)" strokeWidth={1.2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </div>

      {storageData.length > 0 && (
        <div className="flight-card">
          <div className="flight-card-header"><Database size={14} /> STORAGE PREDICTION (90 min)</div>
          <div className="flight-card-body">
            <div style={{ height: 130 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={storageData}>
                  <defs>
                    <linearGradient id="storageGradF" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="t" tick={{ fontSize: 9, fill: '#64748b' }} tickFormatter={v => `${v}m`} />
                  <YAxis tick={{ fontSize: 9, fill: '#64748b' }} tickFormatter={v => `${v}G`} width={32} />
                  <Tooltip content={<ChartTooltipContent />} />
                  <Area type="monotone" dataKey="used" name="Used" stroke="#a855f7" fill="url(#storageGradF)" strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Pass Timeline Gantt ── */
function PassTimelineGantt() {
  const [passes, setPasses] = useState([]);

  useEffect(() => {
    const fetch = () => api.getGroundStationPasses().then(d => {
      if (d && d.passes) setPasses(d.passes.slice(0, 12));
    });
    fetch();
    const id = setInterval(fetch, 60000);
    return () => clearInterval(id);
  }, []);

  const { timeRange, bars } = useMemo(() => {
    if (passes.length === 0) return { timeRange: 0, bars: [] };
    const now = Date.now();
    const windowHrs = 6;
    const windowMs = windowHrs * 3600000;
    const endMs = now + windowMs;

    const b = passes
      .map(p => {
        const aos = new Date(p.aos_time).getTime();
        const los = new Date(p.los_time).getTime();
        if (los < now || aos > endMs) return null;
        return {
          station: p.station_name,
          maxElev: p.max_elevation_deg,
          leftPct: Math.max(0, ((aos - now) / windowMs) * 100),
          widthPct: Math.max(0.5, ((Math.min(los, endMs) - Math.max(aos, now)) / windowMs) * 100),
          duration: Math.round(p.duration_sec),
        };
      })
      .filter(Boolean);
    return { timeRange: windowHrs, bars: b };
  }, [passes]);

  if (passes.length === 0) return null;

  return (
    <div className="flight-card" style={{ gridColumn: '1 / -1' }}>
      <div className="flight-card-header"><Clock size={14} /> PASS TIMELINE (next {timeRange}h)</div>
      <div className="flight-card-body">
        <div className="pass-gantt">
          <div className="pass-gantt-axis">
            {[0, 1, 2, 3, 4, 5, 6].map(h => (
              <span key={h} className="pass-gantt-tick" style={{ left: `${(h / 6) * 100}%` }}>+{h}h</span>
            ))}
          </div>
          <div className="pass-gantt-rows">
            {bars.map((b, i) => (
              <div key={i} className="pass-gantt-row">
                <span className="pass-gantt-label">{b.station.replace('ISTRAC ', '')}</span>
                <div className="pass-gantt-track">
                  <div
                    className="pass-gantt-bar"
                    style={{ left: `${b.leftPct}%`, width: `${b.widthPct}%` }}
                    title={`${b.station} | ${b.duration}s | ${b.maxElev}° max`}
                  >
                    <span className="pass-gantt-bar-text">{b.maxElev}°</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Flight Dashboard ── */
export default function FlightDashboard({ telemetry, onNetworkChange }) {
  return (
    <div className="flight-dashboard">
      <div className="flight-col">
        <TLEQuickLoad />
        <GroundNetworkSelector onNetworkChange={onNetworkChange} />
      </div>
      <div className="flight-col">
        <ECIStateCard telemetry={telemetry} />
        <PowerPredictionCard />
      </div>
      <PassTimelineGantt />
    </div>
  );
}
