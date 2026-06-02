import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  ReferenceLine, Tooltip,
} from 'recharts';

/* ─── RuleFiringHeatmap (custom SVG grid) ────────────────────
 *
 * Rows = rule names, cols = time-bucket centers. Cell opacity scales
 * with firing count. Lets the operator spot a hot subsystem or a
 * flapping rule at a glance.
 */
export function RuleFiringHeatmap({ heatmap }) {
  const rules = heatmap?.rules || [];
  const labels = heatmap?.bucket_labels || [];
  if (!rules.length) {
    return <div className="mon-empty">No rule firings in the last {heatmap?.hours || 24}h.</div>;
  }
  const maxCount = rules.reduce(
    (m, r) => Math.max(m, ...r.counts), 1
  );
  const rowH = 18;
  const labelW = 110;
  const cols = labels.length;

  return (
    <div className="mon-heatmap" style={{ height: rules.length * rowH + 24 }}>
      <svg width="100%" height="100%"
           viewBox={`0 0 ${labelW + cols * 6} ${rules.length * rowH + 24}`}
           preserveAspectRatio="none">
        {/* Bucket axis labels — show first/middle/last */}
        {[0, Math.floor(cols / 2), cols - 1].map((idx) => (
          <text key={idx} x={labelW + idx * 6 + 3} y={10}
                fill="#7e7e87" fontFamily="Poppins, sans-serif" fontSize="8">
            {labels[idx]?.slice(11, 16) || ''}
          </text>
        ))}
        {rules.map((r, ri) => (
          <g key={r.rule_id}>
            <text x={4} y={24 + ri * rowH + rowH / 2 + 3}
                  fill="#c8c8cc" fontFamily="Poppins, sans-serif"
                  fontSize="9.5">{r.rule_id || '(unknown)'}</text>
            {r.counts.map((c, ci) => (
              <rect key={ci}
                    x={labelW + ci * 6} y={24 + ri * rowH + 2}
                    width={5} height={rowH - 4}
                    fill="#b39148"
                    fillOpacity={c === 0 ? 0.04 : 0.18 + 0.7 * (c / maxCount)}>
                <title>{r.rule_id} · {labels[ci]?.slice(11, 16)} · {c}×</title>
              </rect>
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ─── AnomalyTimeline ─────────────────────────────────────── */
const SEV_COLOR = {
  CRITICAL: '#b06560',
  WARNING:  '#b39148',
  INFO:     '#7e7e87',
};

export function AnomalyTimeline({ events = [], minutes = 60 }) {
  const wrapRef = useRef(null);
  const [box, setBox] = useState({ w: 720, h: 64 });
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      setBox({ w: Math.max(420, e.contentRect.width), h: 64 });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const cutoff = Date.now() - minutes * 60 * 1000;
  const inWin = events.filter((e) => new Date(e.t).getTime() >= cutoff);
  const toX = (ms) => 8 + ((ms - cutoff) / (Date.now() - cutoff)) * (box.w - 16);

  return (
    <div className="mon-anomaly" ref={wrapRef}>
      <svg width="100%" height={box.h} viewBox={`0 0 ${box.w} ${box.h}`}>
        <line x1={8} y1={box.h / 2} x2={box.w - 8} y2={box.h / 2}
              stroke="#1f1f23" strokeWidth="0.6" />
        {/* Time ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
          <g key={i}>
            <line x1={8 + f * (box.w - 16)} y1={box.h / 2 - 4}
                  x2={8 + f * (box.w - 16)} y2={box.h / 2 + 4}
                  stroke="#3a3a44" strokeWidth="0.5" />
            <text x={8 + f * (box.w - 16)} y={box.h - 4} textAnchor="middle"
                  fill="#7e7e87" fontFamily="Poppins, sans-serif" fontSize="8">
              {f === 0 ? `-${minutes}m` : f === 1 ? 'now' : ''}
            </text>
          </g>
        ))}
        {inWin.map((e, i) => {
          const x = toX(new Date(e.t).getTime());
          const color = SEV_COLOR[e.severity] || '#b39148';
          return (
            <g key={i} style={{ cursor: 'pointer' }} onClick={() => setPicked(e)}>
              <circle cx={x} cy={box.h / 2} r="4"
                      fill={color} fillOpacity="0.5"
                      stroke={color} strokeWidth="1" />
              <title>{e.rule_id} · {e.t.slice(11, 19)} · {e.severity}</title>
            </g>
          );
        })}
      </svg>
      {picked && (
        <div className="mon-anomaly-detail mono">
          <span>{picked.t.slice(11, 19)} UTC</span>
          <span>·</span>
          <span>{picked.rule_id}</span>
          {picked.subsystem && <><span>·</span><span>{picked.subsystem}</span></>}
          <span>·</span>
          <span style={{ color: SEV_COLOR[picked.severity] || '#b39148' }}>
            {picked.severity}
          </span>
          {picked.message && <><span>·</span><span>{picked.message}</span></>}
          <button className="mon-x" onClick={() => setPicked(null)}>×</button>
        </div>
      )}
    </div>
  );
}

/* ─── StabilityTrend ──────────────────────────────────────── */
export function StabilityTrend({ samples = [] }) {
  const data = samples.map((s) => ({ t: new Date(s.t).getTime(), v: s.v }));
  if (!data.length) {
    return <div className="mon-empty">Stability trend will appear once samples accrue.</div>;
  }
  const fmtT = (ms) => {
    const d = new Date(ms);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  };
  return (
    <div className="mon-chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 12, bottom: 18, left: 28 }}>
          <CartesianGrid stroke="#1f1f23" vertical={false} />
          {/* Band shading via reference areas (rendered as horizontal lines for simplicity) */}
          <ReferenceLine y={30} stroke="#b06560" strokeDasharray="3 3" strokeOpacity="0.4"
                         label={{ value: 'unstable', fill: '#b06560',
                                  fontSize: 8, position: 'right' }} />
          <ReferenceLine y={65} stroke="#b39148" strokeDasharray="3 3" strokeOpacity="0.4"
                         label={{ value: 'marginal', fill: '#b39148',
                                  fontSize: 8, position: 'right' }} />
          <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']}
                 tickFormatter={fmtT}
                 tick={{ fill: '#7e7e87', fontSize: 9 }} />
          <YAxis domain={[0, 100]}
                 tick={{ fill: '#7e7e87', fontSize: 9 }} />
          <Tooltip contentStyle={{
            background: '#080808', border: '1px solid #1f1f23',
            fontSize: 10, color: '#c8c8cc',
          }} labelFormatter={fmtT} />
          <Line type="monotone" dataKey="v" stroke="#4a6f93"
                strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─── StateFlowHistory — horizontal stacked bar ──────────── */
const MODE_COLOR = {
  AUTONOMOUS: '#5e8c6f',
  GUARDED:    '#b39148',
  SAFE:       '#b06560',
  CRITICAL:   '#7e2a26',
  NOMINAL:    '#5e8c6f',
};

export function StateFlowHistory({ states = [], totalSeconds = 0 }) {
  if (!states.length || !totalSeconds) {
    return <div className="mon-empty">State-flow chart populates once history accrues.</div>;
  }
  const acc = states.reduce((a, s) => a + s.seconds, 0) || 1;
  return (
    <div className="mon-stateflow">
      <div className="mon-stateflow-bar">
        {states.map((s, i) => (
          <div key={i} className="mon-stateflow-seg"
               style={{
                 width: `${100 * s.seconds / acc}%`,
                 background: MODE_COLOR[s.mode] || '#7e7e87',
               }}>
            <title>{s.mode} · {s.seconds}s · {s.pct}%</title>
          </div>
        ))}
      </div>
      <ul className="mon-stateflow-legend">
        {states.map((s) => (
          <li key={s.mode}>
            <span className="dot" style={{ background: MODE_COLOR[s.mode] || '#7e7e87' }} />
            <span className="mon-legend-name">{s.mode}</span>
            <span className="mon-legend-val mono">{s.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─── SubsystemTrendGrid (small-multiples) ─────────────────── */
const TREND_CHANNELS = [
  { key: 'battery_pct',    label: 'Battery SOC', unit: '%', warn: 40, crit: 20, low: true },
  { key: 'battery_temp_c', label: 'Battery °C',  unit: '°C', warn: 35, crit: 40 },
  { key: 'panel_temp_c',   label: 'Panel °C',    unit: '°C', warn: 50, crit: 60 },
  { key: 'snr_db',         label: 'SNR',         unit: 'dB', warn: 8,  crit: 5, low: true },
  { key: 'pointing_error', label: 'Pointing',    unit: '°',  warn: 0.3, crit: 0.6 },
  { key: 'storage_pct',    label: 'Storage',     unit: '%', warn: 70, crit: 90 },
];

export function SubsystemTrendGrid({ samples = [] }) {
  if (!samples.length) {
    return <div className="mon-empty">Subsystem small-multiples populate as the buffer fills.</div>;
  }
  return (
    <div className="mon-mini-grid">
      {TREND_CHANNELS.map((ch) => (
        <MiniTrend key={ch.key} ch={ch} samples={samples} />
      ))}
    </div>
  );
}

function MiniTrend({ ch, samples }) {
  const data = samples.map((s) => ({
    t: new Date(s.t).getTime(),
    v: s[ch.key] ?? null,
  }));
  const last = data.length ? data[data.length - 1].v : null;
  return (
    <div className="mon-mini-card">
      <div className="mon-mini-head">
        <span className="mon-mini-label">{ch.label}</span>
        <span className="mon-mini-val mono">
          {last == null ? '—' : Number(last).toFixed(1)}<span className="mon-mini-unit"> {ch.unit}</span>
        </span>
      </div>
      <div className="mon-mini-canvas">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 18 }}>
            <CartesianGrid stroke="#1f1f23" vertical={false} />
            <XAxis dataKey="t" hide />
            <YAxis domain={['auto', 'auto']} hide />
            {ch.warn != null && (
              <ReferenceLine y={ch.warn} stroke="#b39148"
                             strokeDasharray="3 3" strokeWidth={1} strokeOpacity="0.5" />
            )}
            {ch.crit != null && (
              <ReferenceLine y={ch.crit} stroke="#b06560"
                             strokeDasharray="3 3" strokeWidth={1} strokeOpacity="0.5" />
            )}
            <Line type="monotone" dataKey="v" stroke="#4a6f93"
                  strokeWidth={1.2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
