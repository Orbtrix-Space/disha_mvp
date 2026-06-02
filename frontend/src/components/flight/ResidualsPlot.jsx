import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip,
  ReferenceLine, ReferenceArea, Scatter, Line,
} from 'recharts';

/*
 * ResidualsPlot — post-fit position residuals over the fit arc.
 *
 * X: seconds from OD reference epoch (the arc midpoint by default).
 * Y: residual in metres.
 * Series:
 *   - shaded ±1σ band (sigma = the measurement noise reported by OD)
 *   - zero baseline
 *   - dots: per-axis residuals, toggleable (norm | X | Y | Z)
 *
 * Demonstrates fit quality visually — when |residuals| stays inside the
 * band and randomly distributed, the fit is honest; trends or outliers
 * point at unmodelled physics or bad fixes.
 */

const SERIES = [
  { key: 'norm_m', label: '|r|', color: 'var(--accent-teal, #6b8fb5)' },
  { key: 'x_m',    label: 'X',   color: '#c8c8d0' },
  { key: 'y_m',    label: 'Y',   color: '#94a8c4' },
  { key: 'z_m',    label: 'Z',   color: '#c6a04e' },
];

export default function ResidualsPlot({ residuals = [], sigmaM = 5, rmsM = 0 }) {
  const [active, setActive] = useState(['norm_m']);

  const data = useMemo(
    () => residuals.map((r) => ({ t: r.t_s, ...r })),
    [residuals],
  );

  const yDomain = useMemo(() => {
    if (!data.length) return [-10, 10];
    const cap = Math.max(
      sigmaM * 4,
      ...data.map((d) => Math.abs(d.norm_m) || 0),
    );
    const pad = cap * 1.2;
    return [-pad, pad];
  }, [data, sigmaM]);

  const xDomain = useMemo(() => {
    if (!data.length) return [0, 1];
    return [data[0].t, data[data.length - 1].t];
  }, [data]);

  const toggle = (k) => setActive((cur) =>
    cur.includes(k) ? cur.filter((s) => s !== k) : [...cur, k]
  );

  if (!data.length) {
    return <div className="plot-empty">No residuals available — run OD first.</div>;
  }

  return (
    <div className="plot-wrap">
      <div className="plot-toolbar">
        <span className="plot-title">Post-fit residuals</span>
        <div className="plot-legend">
          {SERIES.map((s) => (
            <button key={s.key}
                    className={`plot-leg-btn ${active.includes(s.key) ? 'on' : ''}`}
                    onClick={() => toggle(s.key)}
                    style={{ borderColor: s.color }}>
              <span className="plot-leg-dot" style={{ background: s.color }} />
              {s.label}
            </button>
          ))}
        </div>
        <div className="plot-annot mono">
          σ ±{sigmaM} m · RMS {rmsM} m
        </div>
      </div>
      <div className="plot-canvas">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}
                         margin={{ top: 6, right: 16, bottom: 22, left: 28 }}>
            <CartesianGrid stroke="#26262c" vertical={false} />
            <ReferenceArea y1={-sigmaM} y2={sigmaM}
                           fill="#2a3a4a" fillOpacity={0.35} />
            <ReferenceLine y={0} stroke="#52525e" strokeWidth={1} />
            <XAxis dataKey="t" type="number" domain={xDomain}
                   tick={{ fill: '#8d8d96', fontSize: 10 }}
                   label={{ value: 'time from epoch (s)',
                            position: 'insideBottom', offset: -6,
                            fill: '#8d8d96', fontSize: 10 }} />
            <YAxis domain={yDomain}
                   tick={{ fill: '#8d8d96', fontSize: 10 }}
                   label={{ value: 'residual (m)', angle: -90,
                            position: 'insideLeft', offset: 8,
                            fill: '#8d8d96', fontSize: 10 }} />
            <Tooltip contentStyle={{
              background: '#16161a', border: '1px solid #2a2a30',
              fontSize: 11, color: '#e1e1e6',
            }} />
            {SERIES.filter((s) => active.includes(s.key)).map((s) => (
              <Scatter key={s.key} dataKey={s.key} name={s.label}
                       fill={s.color} shape="circle" />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
