import { useEffect, useState, useMemo } from 'react';
import { api } from '../services/api';

/**
 * DemoTimeline — horizontal time-aligned chart of the unified loop.
 *
 * Renders:
 *   - anomaly_score as a teal area line
 *   - autonomy mode as background bands (green=AUTONOMOUS,
 *     amber=GUARDED, red=SAFE)
 *   - rule alerts as orange markers along the top
 *   - replan events as vertical white lines
 *
 * Purpose: make the closed-loop architecture visible in one glance.
 * When an AI flag triggers an autonomy change and a re-plan, this
 * chart shows it as a single connected event — that is the demo's
 * single most important visual.
 */
export default function DemoTimeline({ seconds = 180, height = 110 }) {
  const [samples, setSamples] = useState([]);

  useEffect(() => {
    const tick = async () => {
      const r = await api.getDemoTimeline(seconds);
      if (r?.samples) setSamples(r.samples);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [seconds]);

  const width = 720;
  const margin = { l: 38, r: 8, t: 14, b: 18 };
  const innerW = width - margin.l - margin.r;
  const innerH = height - margin.t - margin.b;

  const data = useMemo(() => {
    if (!samples.length) return [];
    return samples.map((s, i) => ({
      i,
      anomaly: Math.max(0, Math.min(1, s.anomaly_score || 0)),
      risk: Math.max(0, Math.min(1, s.risk_score || 0)),
      combined: Math.max(0, Math.min(1, s.combined_risk_score || 0)),
      mode: s.autonomy_mode || 'AUTONOMOUS',
      modeChanged: s.mode_changed,
      replan: s.replan_triggered,
      newAlerts: s.new_rule_alert_ids || [],
      flagged: s.ai_flagged_subsystems || [],
    }));
  }, [samples]);

  if (!data.length) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>UNIFIED LOOP TIMELINE</div>
        <div style={{ padding: 16, fontSize: 11, opacity: 0.5 }}>
          Waiting for telemetry...
        </div>
      </div>
    );
  }

  const xOf = (i) => margin.l + (i / Math.max(1, data.length - 1)) * innerW;
  const yOf = (v) => margin.t + (1 - v) * innerH;

  // Group consecutive samples by autonomy mode for the background bands
  const bands = [];
  let cur = null;
  data.forEach((d, i) => {
    if (!cur || cur.mode !== d.mode) {
      if (cur) cur.end = i;
      cur = { mode: d.mode, start: i, end: i };
      bands.push(cur);
    } else {
      cur.end = i;
    }
  });
  if (cur) cur.end = data.length - 1;

  const modeColor = (m) =>
    m === 'SAFE' ? '#3a0d0d' :
    m === 'GUARDED' ? '#3a2b0d' :
    '#0d2a16';

  // Anomaly score area path
  const areaPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${yOf(d.anomaly)}`).join(' ')
    + ` L ${xOf(data.length - 1)} ${yOf(0)} L ${xOf(0)} ${yOf(0)} Z`;
  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${yOf(d.anomaly)}`).join(' ');
  const riskLinePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${yOf(d.risk)}`).join(' ');

  // Marker events
  const replans = data.map((d, i) => d.replan ? i : null).filter((x) => x !== null);
  const ruleAlerts = data.map((d, i) =>
    d.newAlerts.length ? { i, ids: d.newAlerts } : null
  ).filter(Boolean);

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        UNIFIED LOOP TIMELINE
        <span style={{ marginLeft: 'auto', opacity: 0.5, fontSize: 10 }}>
          last {data.length}s
        </span>
      </div>
      <svg width={width} height={height} style={{ display: 'block' }}>
        {/* Autonomy mode background bands */}
        {bands.map((b, idx) => (
          <rect
            key={idx}
            x={xOf(b.start)}
            y={margin.t}
            width={Math.max(1, xOf(b.end) - xOf(b.start))}
            height={innerH}
            fill={modeColor(b.mode)}
          />
        ))}

        {/* y-axis grid (0.4 warning, 0.7 critical) */}
        <line x1={margin.l} y1={yOf(0.4)} x2={margin.l + innerW} y2={yOf(0.4)}
              stroke="#444" strokeDasharray="3 3" strokeWidth={0.5} />
        <line x1={margin.l} y1={yOf(0.7)} x2={margin.l + innerW} y2={yOf(0.7)}
              stroke="#933" strokeDasharray="3 3" strokeWidth={0.5} />

        {/* Rule risk score (faint, for comparison) */}
        <path d={riskLinePath} fill="none" stroke="#888" strokeWidth={1} opacity={0.5} />

        {/* AI anomaly score (primary signal) */}
        <path d={areaPath} fill="rgba(60,200,170,0.25)" />
        <path d={linePath} fill="none" stroke="#3cc8aa" strokeWidth={1.5} />

        {/* Replan vertical strokes (loop closure cue) */}
        {replans.map((i) => (
          <line key={`rp-${i}`}
                x1={xOf(i)} y1={margin.t}
                x2={xOf(i)} y2={margin.t + innerH}
                stroke="#fff" strokeWidth={1} opacity={0.85} />
        ))}

        {/* Rule alert markers along the top */}
        {ruleAlerts.map(({ i, ids }) => (
          <g key={`ra-${i}`}>
            <circle cx={xOf(i)} cy={margin.t + 4} r={3} fill="#f80" />
            <title>{ids.join(', ')}</title>
          </g>
        ))}

        {/* y-axis labels */}
        <text x={4} y={yOf(0) + 3} fill="#666" fontSize={9}>0</text>
        <text x={4} y={yOf(0.4) + 3} fill="#aaa" fontSize={9}>0.4</text>
        <text x={4} y={yOf(0.7) + 3} fill="#c66" fontSize={9}>0.7</text>
        <text x={4} y={yOf(1.0) + 3} fill="#666" fontSize={9}>1</text>
      </svg>

      <div style={legendStyle}>
        <Swatch color="#3cc8aa" label="AI anomaly_score" />
        <Swatch color="#888" label="rule risk_score" />
        <Swatch color="#fff" label="re-plan" stroke />
        <Swatch color="#f80" label="rule alert" dot />
        <span style={{ flex: 1 }} />
        <Swatch color="#0d2a16" label="AUTONOMOUS" block />
        <Swatch color="#3a2b0d" label="GUARDED" block />
        <Swatch color="#3a0d0d" label="SAFE" block />
      </div>
    </div>
  );
}

function Swatch({ color, label, stroke, dot, block }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 10 }}>
      {dot ? (
        <span style={{ width: 6, height: 6, background: color, borderRadius: '50%' }} />
      ) : stroke ? (
        <span style={{ width: 10, height: 2, background: color }} />
      ) : block ? (
        <span style={{ width: 10, height: 10, background: color, border: '1px solid #222' }} />
      ) : (
        <span style={{ width: 10, height: 2, background: color }} />
      )}
      <span>{label}</span>
    </span>
  );
}

const containerStyle = {
  background: '#070707',
  border: '1px solid #222',
  borderRadius: 4,
  fontFamily: 'JetBrains Mono, monospace',
  color: '#ccc',
  margin: '8px 0',
};

const headerStyle = {
  display: 'flex',
  padding: '6px 10px',
  borderBottom: '1px solid #1a1a1a',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.05em',
  color: '#fff',
};

const legendStyle = {
  display: 'flex',
  alignItems: 'center',
  padding: '4px 10px 8px',
  fontSize: 9,
  color: '#aaa',
  flexWrap: 'wrap',
};
