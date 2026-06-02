/*
 * DISHA — SCHEDULE (Constellation Tasking & Scheduling)
 *
 * NEXUS-style functional surface, DISHA-styled visually:
 *   - Left sidebar: Mission Setup (orbit / target deck / horizon / baseline / RUN)
 *   - Sub-nav: Dashboard · Orbit · Target Deck · Scheduling · Analytics · System
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Upload as UploadIcon, Play, Compass, Database, BarChart3,
  PieChart as PieChartIcon, ListChecks, ServerCog, CheckCircle2,
} from 'lucide-react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
} from 'recharts';
import { api } from '../services/api';
import OrbitPlanesPlot from '../components/schedule/OrbitPlanesPlot';
import ConstellationGantt from '../components/schedule/ConstellationGantt';

/* ───── utils ──────────────────────────────────────────────── */
function fmt(n, d = 1) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toFixed(d);
}
function pctStr(n) { return `${fmt(n, 1)}%`; }
function timeShort(iso) { return iso ? iso.slice(11, 16) : '—'; }
function dateShort(iso) {
  return iso ? iso.slice(5, 16).replace('T', ' ') : '—';
}
function toLocalIso(d) {
  if (!d) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/* ───── Mission Setup sidebar ──────────────────────────────── */
function MissionSetup({
  state, onUploadDeck, onHorizonChange, onMissionChange,
  onRun, busy, lastYield,
}) {
  const [missionName, setMissionName] = useState(state?.mission_name || 'PACIFIC RECON · Q2');
  const [inc, setInc] = useState(97.4);
  const [sma, setSma] = useState(6878.13);
  const [raan, setRaan] = useState(22.0);
  const [hStart, setHStart] = useState('');
  const [hStop, setHStop] = useState('');
  const [compare, setCompare] = useState(true);

  useEffect(() => {
    if (state) {
      setMissionName(state.mission_name);
      if (state.horizon_start) setHStart(toLocalIso(new Date(state.horizon_start)));
      if (state.horizon_stop)  setHStop(toLocalIso(new Date(state.horizon_stop)));
    }
  }, [state]);

  const onPickFile = useCallback((e) => {
    const f = e.target.files?.[0];
    if (f) onUploadDeck(f);
  }, [onUploadDeck]);

  const commitHorizon = () => {
    onHorizonChange(
      hStart ? new Date(hStart).toISOString() : null,
      hStop  ? new Date(hStop ).toISOString() : null,
    );
  };

  return (
    <aside className="sch-rail">
      <div className="sch-section">
        <div className="sch-section-head">Mission</div>
        <label className="sch-label">Mission name</label>
        <input className="sch-input" value={missionName}
               onChange={(e) => setMissionName(e.target.value)}
               onBlur={() => onMissionChange({ mission_name: missionName })} />
      </div>

      <div className="sch-section">
        <div className="sch-section-head">Orbit Definition</div>
        <div className="sch-locked-badge">DEMO · CONSTELLATION LOCKED</div>
        <div className="sch-row3">
          <div>
            <label className="sch-label">INC °</label>
            <input className="sch-input mono" value={inc}
                   onChange={(e) => setInc(parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <label className="sch-label">SMA km</label>
            <input className="sch-input mono" value={sma}
                   onChange={(e) => setSma(parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <label className="sch-label">RAAN °</label>
            <input className="sch-input mono" value={raan}
                   onChange={(e) => setRaan(parseFloat(e.target.value) || 0)} />
          </div>
        </div>
        <button className="sch-secondary"
                onClick={() => onMissionChange({
                  inclination_deg: inc,
                  altitude_km: Math.max(100, sma - 6378.137),
                  raan_base_deg: raan,
                })}>
          Apply orbit
        </button>
      </div>

      <div className="sch-section">
        <div className="sch-section-head">Target Deck</div>
        <label className="sch-secondary sch-file">
          <UploadIcon size={11} />
          <span>Upload xlsx</span>
          <input type="file" accept=".xlsx,.xls" hidden onChange={onPickFile} />
        </label>
        <div className="sch-meta">
          <span className="mono">{state?.deck_filename || '—'}</span>
          <span className="sch-meta-pill">{state?.target_count ?? 0} targets</span>
        </div>
      </div>

      <div className="sch-section">
        <div className="sch-section-head">Horizon</div>
        <label className="sch-label">Start UTC</label>
        <input className="sch-input mono" type="datetime-local"
               value={hStart} onChange={(e) => setHStart(e.target.value)}
               onBlur={commitHorizon} />
        <label className="sch-label">End UTC</label>
        <input className="sch-input mono" type="datetime-local"
               value={hStop} onChange={(e) => setHStop(e.target.value)}
               onBlur={commitHorizon} />
      </div>

      <div className="sch-section">
        <label className="sch-toggle">
          <input type="checkbox" checked={compare}
                 onChange={(e) => setCompare(e.target.checked)} />
          <span>Compare to baseline (FIFO)</span>
        </label>
      </div>

      <div className="sch-run">
        <button className="sch-primary"
                disabled={busy}
                onClick={() => onRun(
                  hStart ? new Date(hStart).toISOString() : null,
                  hStop  ? new Date(hStop ).toISOString() : null,
                  compare,
                )}>
          <Play size={12} /> {busy ? 'OPTIMIZING…' : 'RUN OPTIMIZATION'}
        </button>
        <div className="sch-run-status">
          {lastYield != null
            ? `Scheduled ${lastYield.scheduled} of ${lastYield.total} targets`
            : 'Awaiting first run'}
        </div>
      </div>
    </aside>
  );
}

/* ───── KPI / Donut helpers ────────────────────────────────── */
function Kpi({ label, value, sub }) {
  return (
    <div className="sch-kpi">
      <div className="sch-kpi-label">{label}</div>
      <div className="sch-kpi-value mono">{value}</div>
      {sub && <div className="sch-kpi-sub mono">{sub}</div>}
    </div>
  );
}

const DONUT_COLORS = ['#5a7fa8', '#6b9c7c', '#b39148', '#b06560', '#7e7e87'];
function Donut({ title, data, totalLabel }) {
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  return (
    <div className="sch-card">
      {title && <div className="sch-card-head">{title}</div>}
      <div className="sch-donut">
        <div className="sch-donut-canvas">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius="58%" outerRadius="86%"
                   stroke="#000" strokeWidth={1}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.color || DONUT_COLORS[i % DONUT_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{
                background: '#080808', border: '1px solid #1f1f23',
                fontSize: 10, color: '#c8c8cc',
              }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="sch-donut-center mono">
            <div className="sch-donut-total">{total}</div>
            {totalLabel && <div className="sch-donut-sub">{totalLabel}</div>}
          </div>
        </div>
        <ul className="sch-donut-legend">
          {data.map((d, i) => (
            <li key={d.name}>
              <span className="sch-legend-dot"
                    style={{ background: d.color || DONUT_COLORS[i % DONUT_COLORS.length] }} />
              <span className="sch-legend-label">{d.name}</span>
              <span className="sch-legend-val mono">{d.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ───── 1. Dashboard view ──────────────────────────────────── */
function DashboardView({ result, analytics, baselineAnalytics, targets }) {
  if (!result?.scheduled) {
    return (
      <div className="sch-empty">
        Run the optimizer to populate dashboard metrics.
      </div>
    );
  }
  const ana = analytics || {};
  const byId = new Map();
  (result.scheduled || []).forEach((p) => byId.set(p.request_id, { kind: 'CLEAR', p }));
  (result.rejected || []).forEach((r) => byId.set(r.request_id, { kind: r.reason, r }));
  const rows = (targets || []).map((t) => ({
    target: t, outcome: byId.get(t.request_id),
  }));
  return (
    <div className="sch-grid-2">
      <div className="sch-kpi-row sch-span-2">
        <Kpi label="Capacity Utilization" value={pctStr(ana.capacity_utilization_pct)} />
        <Kpi label="Avg Priority Served" value={`P${fmt(ana.avg_priority_served, 2)}`} />
        <Kpi label="Avg Cloud Cover"      value={pctStr(ana.avg_cloud_pct)} />
        <Kpi label="Total Targets Tasked" value={ana.n_scheduled}
             sub={`of ${ana.n_targets}`} />
      </div>
      <div className="sch-card">
        <div className="sch-card-head">Tasking yield</div>
        <div className="sch-yield-row">
          <div className="sch-yield-val mono">{pctStr(ana.yield_pct)}</div>
          <div className="sch-yield-meta">
            <div><span className="dot ok" /> Scheduled <b>{ana.n_scheduled}</b></div>
            <div><span className="dot err" /> Rejected <b>{ana.n_rejected}</b></div>
            <div className="sch-yield-line mono">of {ana.n_targets} targets</div>
          </div>
        </div>
        {baselineAnalytics && (
          <div className="sch-yield-baseline mono">
            FIFO baseline: {pctStr(baselineAnalytics.yield_pct)}
            {' '}({baselineAnalytics.n_scheduled} / {baselineAnalytics.n_targets})
            {' · '}
            <span className={ana.yield_pct >= baselineAnalytics.yield_pct ? 'ok' : 'err'}>
              {ana.yield_pct >= baselineAnalytics.yield_pct ? '+' : '–'}
              {fmt(Math.abs(ana.yield_pct - baselineAnalytics.yield_pct), 1)} pp
            </span>
          </div>
        )}
      </div>
      <div className="sch-card">
        <div className="sch-card-head">Rejection reasons</div>
        <ul className="sch-reasons">
          {Object.entries(ana.rejection_reasons || {}).map(([k, v]) => (
            <li key={k} className={`sch-reason-row sch-reason-${k.toLowerCase()}`}>
              <span className="sch-reason-name">{k.replace('_', ' ')}</span>
              <span className="sch-reason-bar">
                <span style={{
                  width: `${Math.min(100, (v / Math.max(1, ana.n_rejected || 1)) * 100)}%`,
                }} />
              </span>
              <span className="sch-reason-val mono">{v}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="sch-card sch-span-2">
        <div className="sch-card-head">Weather &amp; conflict insights</div>
        <div className="sch-table-wrap">
          <table className="sch-table">
            <thead>
              <tr>
                <th>Target</th><th>AOI</th><th>PRI</th><th>SAT</th>
                <th>Window / Reason</th><th className="num">Cloud</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const o = r.outcome;
                const status = o?.kind || 'PENDING';
                const cls = status === 'CLEAR' ? 'ok' :
                            (status === 'NO_ACCESS' || status === 'CAPACITY') ? 'muted' : 'err';
                return (
                  <tr key={r.target.request_id}>
                    <td className="mono">{r.target.request_id}</td>
                    <td>{r.target.aoi_name}</td>
                    <td className="mono">P{r.target.priority}</td>
                    <td className="mono">{o?.p?.sat_id || '—'}</td>
                    <td className="mono">
                      {o?.kind === 'CLEAR'
                        ? `${timeShort(o.p.start_time)}–${timeShort(o.p.stop_time)}`
                        : (o?.r?.detail || '—')}
                    </td>
                    <td className="num mono">
                      {o?.kind === 'CLEAR' ? pctStr(o.p.cloud_pct) : '—'}
                    </td>
                    <td><span className={`sch-pill sch-pill-${cls}`}>{status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ───── 2. Orbit Definition view ───────────────────────────── */
function OrbitView({ state, constellation, tracks }) {
  const sats = constellation?.satellites || [];
  return (
    <div className="sch-grid-2">
      <div className="sch-kpi-row sch-span-2">
        <Kpi label="Mission" value={state?.mission_name || '—'} />
        <Kpi label="Constellation size" value={sats.length} sub="satellites" />
        <Kpi label="Avg period"   value={`${fmt(constellation?.avg_period_min, 2)} min`} />
        <Kpi label="Avg altitude" value={`${fmt(constellation?.avg_altitude_km, 1)} km`} />
      </div>
      <div className="sch-card sch-span-2 sch-orbit-card">
        <div className="sch-card-head">Orbital planes (SSO · 3 planes)</div>
        <OrbitPlanesPlot tracks={tracks?.tracks || []} />
      </div>
      <div className="sch-card sch-span-2">
        <div className="sch-card-head">Per-satellite elements</div>
        <div className="sch-table-wrap">
          <table className="sch-table">
            <thead>
              <tr>
                <th>SAT</th><th className="num">ALTITUDE</th>
                <th className="num">INC</th><th className="num">RAAN</th>
                <th>LTAN</th><th className="num">PERIOD</th>
                <th className="num">ECC</th><th>COLOR</th>
              </tr>
            </thead>
            <tbody>
              {sats.map((s) => (
                <tr key={s.sat_id}>
                  <td className="mono">{s.sat_id}</td>
                  <td className="num mono">{fmt(s.altitude_km, 1)} km</td>
                  <td className="num mono">{fmt(s.inclination_deg, 2)}°</td>
                  <td className="num mono">{fmt(s.raan_deg, 1)}°</td>
                  <td className="mono">{s.ltan}</td>
                  <td className="num mono">{fmt(s.period_min, 2)} min</td>
                  <td className="num mono">{fmt(s.eccentricity, 4)}</td>
                  <td>
                    <span className="sch-swatch" style={{ background: s.color }} />
                    <span className="mono">{s.color}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ───── 3. Target Deck view ────────────────────────────────── */
function DeckView({ targets, result }) {
  const status = useMemo(() => {
    const m = new Map();
    (result?.scheduled || []).forEach((p) => m.set(p.request_id, { kind: 'CLEAR', p }));
    (result?.rejected || []).forEach((r) => m.set(r.request_id, { kind: r.reason, r }));
    return m;
  }, [result]);
  const scheduledN = result?.scheduled?.length || 0;
  const rejectedN  = result?.rejected?.length  || 0;
  return (
    <div className="sch-card">
      <div className="sch-card-head sch-card-head-meta">
        <span>Target deck</span>
        <span className="mono">
          {targets.length} targets · {scheduledN} scheduled · {rejectedN} rejected
        </span>
      </div>
      <div className="sch-table-wrap">
        <table className="sch-table">
          <thead>
            <tr>
              <th>ID</th><th>AOI</th>
              <th className="num">LAT</th><th className="num">LON</th>
              <th>WINDOW UTC</th><th className="num">PRI</th>
              <th className="num">CLOUD MAX</th><th>OUTCOME</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => {
              const s = status.get(t.request_id);
              const kind = s?.kind || 'PENDING';
              const cls = kind === 'CLEAR' ? 'ok' :
                          (kind === 'NO_ACCESS' || kind === 'CAPACITY') ? 'muted' : 'err';
              return (
                <tr key={t.request_id}>
                  <td className="mono">{t.request_id}</td>
                  <td>{t.aoi_name}</td>
                  <td className="num mono">{fmt(t.lat_deg, 3)}</td>
                  <td className="num mono">{fmt(t.lon_deg, 3)}</td>
                  <td className="mono">{dateShort(t.start_time)} – {dateShort(t.stop_time)}</td>
                  <td className="num mono">P{t.priority}</td>
                  <td className="num mono">{fmt(t.cloud_max_pct, 0)}%</td>
                  <td>
                    <span className={`sch-pill sch-pill-${cls}`}>{kind}</span>
                    {s?.kind === 'CLEAR' && (
                      <span className="sch-pill-extra mono">
                        {' '}{s.p.sat_id} · cloud {fmt(s.p.cloud_pct, 0)}%
                      </span>
                    )}
                    {s?.r?.detail && (
                      <span className="sch-pill-extra mono"> · {s.r.detail}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───── 4. Scheduling view ─────────────────────────────────── */
function SchedulingView({ result, analytics, horizonStart, horizonStop }) {
  const ana = analytics || {};
  return (
    <div className="sch-grid-2">
      <div className="sch-card sch-span-2">
        <ConstellationGantt
          scheduled={result?.scheduled || []}
          rejected={result?.rejected || []}
          horizonStart={horizonStart}
          horizonStop={horizonStop}
        />
      </div>
      <Donut title="Tasking yield"
             data={[
               { name: 'Scheduled', value: ana.n_scheduled || 0, color: '#5e8c6f' },
               { name: 'Rejected',  value: ana.n_rejected  || 0, color: '#b06560' },
             ]} totalLabel="targets" />
      <div className="sch-card">
        <div className="sch-card-head">By satellite</div>
        <ul className="sch-bars">
          {Object.entries(ana.by_satellite || {}).map(([sat, n]) => (
            <li key={sat} className="sch-bar-row">
              <span className="sch-bar-name mono">{sat}</span>
              <span className="sch-bar-track">
                <span className="sch-bar-fill"
                      style={{
                        width: `${Math.min(100, (n / Math.max(1, ana.n_scheduled || 1)) * 100)}%`,
                      }} />
              </span>
              <span className="sch-bar-val mono">{n}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ───── 5. Analytics view ──────────────────────────────────── */
function AnalyticsView({ analytics, baselineAnalytics }) {
  const ana = analytics || {};
  if (!ana.n_targets) {
    return <div className="sch-empty">Run the optimizer to populate analytics.</div>;
  }
  return (
    <>
      <div className="sch-kpi-row">
        <Kpi label="Total targets" value={ana.n_targets} />
        <Kpi label="Tasking yield" value={pctStr(ana.yield_pct)}
             sub={baselineAnalytics ? `vs FIFO ${pctStr(baselineAnalytics.yield_pct)}` : null} />
        <Kpi label="Avg priority served" value={`P${fmt(ana.avg_priority_served, 2)}`} />
        <Kpi label="Constellation" value={Object.keys(ana.by_satellite || {}).length}
             sub="satellites" />
      </div>
      <div className="sch-grid-2">
        <Donut title="Scheduled vs Rejected"
               data={[
                 { name: 'Scheduled', value: ana.n_scheduled, color: '#5e8c6f' },
                 { name: 'Rejected',  value: ana.n_rejected,  color: '#b06560' },
               ]} totalLabel="targets" />
        <Donut title="Rejection reasons"
               data={Object.entries(ana.rejection_reasons || {})
                 .filter(([, v]) => v > 0)
                 .map(([k, v]) => ({
                   name: k.replace('_', ' '),
                   value: v,
                   color: k === 'WEATHER' ? '#b39148' :
                          k === 'CONFLICT' ? '#b06560' :
                          k === 'NO_ACCESS' ? '#7e7e87' : '#4a6f93',
                 }))} totalLabel="rejected" />
        <Donut title="Priority served"
               data={Object.entries(ana.by_priority || {})
                 .sort((a, b) => Number(a[0]) - Number(b[0]))
                 .map(([k, v]) => ({ name: `P${k}`, value: v }))}
               totalLabel="scheduled" />
        <div className="sch-card">
          <div className="sch-card-head">Load by satellite</div>
          <ul className="sch-bars">
            {Object.entries(ana.by_satellite || {}).map(([sat, n]) => (
              <li key={sat} className="sch-bar-row">
                <span className="sch-bar-name mono">{sat}</span>
                <span className="sch-bar-track">
                  <span className="sch-bar-fill"
                        style={{ width: `${Math.min(100, (n / Math.max(1, ana.n_scheduled)) * 100)}%` }} />
                </span>
                <span className="sch-bar-val mono">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

/* ───── 6. System Status view ──────────────────────────────── */
function SystemStatusView() {
  const [data, setData] = useState(null);
  useEffect(() => { api.getSchedulerSystemStatus().then(setData); }, []);
  if (!data?.services) return <div className="sch-empty">Loading…</div>;
  return (
    <div className="sch-status-grid">
      {data.services.map((s) => (
        <div key={s.key} className="sch-card sch-status-card">
          <div className="sch-status-row">
            <CheckCircle2 size={12} className="sch-status-icon ok" />
            <span className="sch-status-label">{s.label}</span>
            <span className="sch-status-pill mono">{s.status}</span>
          </div>
          <div className="sch-status-detail mono">{s.detail}</div>
        </div>
      ))}
    </div>
  );
}

/* ───── Main page ─────────────────────────────────────────── */
const TABS = [
  { id: 'dashboard', label: 'Dashboard',        icon: <BarChart3 size={11} /> },
  { id: 'orbit',     label: 'Orbit Definition', icon: <Compass size={11} /> },
  { id: 'deck',      label: 'Target Deck',      icon: <Database size={11} /> },
  { id: 'schedule',  label: 'Scheduling',       icon: <ListChecks size={11} /> },
  { id: 'analytics', label: 'Analytics',        icon: <PieChartIcon size={11} /> },
  { id: 'system',    label: 'System Status',    icon: <ServerCog size={11} /> },
];

export default function ScheduleDashboard() {
  const [tab, setTab] = useState('dashboard');
  const [state, setState] = useState(null);
  const [constellation, setConstellation] = useState(null);
  const [tracks, setTracks] = useState(null);
  const [targets, setTargets] = useState([]);
  const [result, setResult] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [baselineAnalytics, setBaselineAnalytics] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [st, cn, tgt, sch, ana] = await Promise.all([
      api.getSchedulerState(),
      api.getConstellation(),
      api.getTargets(),
      api.getSchedule(),
      api.getSchedulerAnalytics(),
    ]);
    if (st) setState(st);
    if (cn) setConstellation(cn);
    if (tgt) setTargets(tgt.targets || []);
    if (sch?.result?.scheduled?.length || sch?.result?.rejected?.length) {
      setResult(sch.result);
    }
    if (ana?.has_result) {
      setAnalytics(ana.analytics);
      setBaselineAnalytics(ana.baseline_analytics);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (tab === 'orbit' && !tracks) {
      api.getConstellationTracks(60).then(setTracks);
    }
  }, [tab, tracks]);

  const onUploadDeck = useCallback(async (file) => {
    const r = await api.uploadTargetDeck(file);
    if (r?.ok) {
      await refresh();
      setResult(null);
      setAnalytics(null);
      setBaselineAnalytics(null);
    } else {
      alert(`Upload failed: ${r?.message || 'unknown error'}`);
    }
  }, [refresh]);

  const onHorizonChange = useCallback(async (s, e) => {
    await api.setHorizon(s, e);
    setTracks(null);
    refresh();
  }, [refresh]);

  const onMissionChange = useCallback(async (payload) => {
    await api.setMission(payload);
    setTracks(null);
    refresh();
  }, [refresh]);

  const onRun = useCallback(async (s, e, compare) => {
    setBusy(true);
    const r = await api.runOptimize(s, e, compare);
    setBusy(false);
    if (r?.ok) {
      setResult(r.result);
      setAnalytics(r.analytics);
      setBaselineAnalytics(r.baseline_analytics);
    } else {
      alert(`Run failed: ${r?.message || 'unknown error'}`);
    }
  }, []);

  const lastYield = analytics
    ? { scheduled: analytics.n_scheduled, total: analytics.n_targets }
    : null;

  return (
    <div className="sch-root">
      <MissionSetup
        state={state}
        onUploadDeck={onUploadDeck}
        onHorizonChange={onHorizonChange}
        onMissionChange={onMissionChange}
        onRun={onRun}
        busy={busy}
        lastYield={lastYield}
      />
      <main className="sch-main">
        <nav className="sch-tabs">
          {TABS.map((t) => (
            <button key={t.id}
                    className={`sch-tab ${tab === t.id ? 'on' : ''}`}
                    onClick={() => setTab(t.id)}>
              {t.icon}<span>{t.label}</span>
            </button>
          ))}
          <div className="sch-tabs-spacer" />
          <span className="sch-tabs-mission mono">{state?.mission_name || '—'}</span>
        </nav>
        <div className="sch-view">
          {tab === 'dashboard' && (
            <DashboardView result={result} analytics={analytics}
                           baselineAnalytics={baselineAnalytics}
                           targets={targets} />
          )}
          {tab === 'orbit' && (
            <OrbitView state={state} constellation={constellation}
                       tracks={tracks} />
          )}
          {tab === 'deck' && (
            <DeckView targets={targets} result={result} />
          )}
          {tab === 'schedule' && (
            <SchedulingView result={result} analytics={analytics}
                            horizonStart={state?.horizon_start}
                            horizonStop={state?.horizon_stop} />
          )}
          {tab === 'analytics' && (
            <AnalyticsView analytics={analytics}
                           baselineAnalytics={baselineAnalytics} />
          )}
          {tab === 'system' && <SystemStatusView />}
        </div>
      </main>
    </div>
  );
}
