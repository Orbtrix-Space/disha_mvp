import { useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip,
  Line, ReferenceLine, Legend,
} from 'recharts';

/*
 * RangeToTCAPlot — relative range vs time around TCA, one curve per
 * candidate close approach. Curves are colour-coded by risk; the
 * selected (or highest-risk) object is emphasised.
 *
 * Data shape from backend (each approach):
 *   range_curve: [{ t_rel_min: number, range_m: number }, ...]
 * X axis is minutes from TCA (negative = before, 0 = TCA, positive = after).
 */

const RISK_COLOR = {
  red:    '#c75f5f',
  yellow: '#c6a04e',
  green:  '#5e9e74',
};

export default function RangeToTCAPlot({ approaches = [], selectedId, onSelect }) {
  const series = useMemo(() => {
    return approaches.map((a) => ({
      id: a.secondary_id,
      label: a.secondary_id,
      risk: a.risk,
      color: RISK_COLOR[a.risk] || '#8d8d96',
      points: (a.range_curve || []).map((p) => ({
        t: p.t_rel_min,
        r_km: p.range_m / 1000.0,
      })),
    })).filter((s) => s.points.length > 0);
  }, [approaches]);

  // Build a combined frame Recharts can render — one row per t value,
  // each series as its own y column keyed by id.
  const data = useMemo(() => {
    if (!series.length) return [];
    const ts = series[0].points.map((p) => p.t);
    return ts.map((t, i) => {
      const row = { t };
      series.forEach((s) => { row[s.id] = s.points[i]?.r_km; });
      return row;
    });
  }, [series]);

  const yMax = useMemo(() => {
    let m = 0;
    series.forEach((s) => s.points.forEach((p) => { if (p.r_km > m) m = p.r_km; }));
    return m * 1.05 || 1;
  }, [series]);

  if (!series.length) {
    return <div className="plot-empty">No close-approach geometry — run pipeline.</div>;
  }

  // Sort so selected/red drawn on top
  const drawOrder = [...series].sort((a, b) => {
    if (a.id === selectedId) return 1;
    if (b.id === selectedId) return -1;
    const rank = { red: 2, yellow: 1, green: 0 };
    return (rank[a.risk] || 0) - (rank[b.risk] || 0);
  });

  return (
    <div className="plot-wrap">
      <div className="plot-toolbar">
        <span className="plot-title">Relative range vs TCA</span>
        <div className="plot-annot mono">
          {series.length} candidate{series.length === 1 ? '' : 's'} · ±60 min
        </div>
      </div>
      <div className="plot-canvas">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}
                     margin={{ top: 6, right: 16, bottom: 22, left: 36 }}>
            <CartesianGrid stroke="#26262c" vertical={false} />
            <ReferenceLine x={0} stroke="#52525e" strokeDasharray="3 3"
                           label={{ value: 'TCA', position: 'top',
                                    fill: '#8d8d96', fontSize: 10 }} />
            <XAxis dataKey="t" type="number" domain={[-60, 60]}
                   ticks={[-60, -30, 0, 30, 60]}
                   tick={{ fill: '#8d8d96', fontSize: 10 }}
                   label={{ value: 'min from TCA',
                            position: 'insideBottom', offset: -6,
                            fill: '#8d8d96', fontSize: 10 }} />
            <YAxis domain={[0, yMax]}
                   tick={{ fill: '#8d8d96', fontSize: 10 }}
                   label={{ value: 'range (km)', angle: -90,
                            position: 'insideLeft', offset: 12,
                            fill: '#8d8d96', fontSize: 10 }} />
            <Tooltip contentStyle={{
              background: '#16161a', border: '1px solid #2a2a30',
              fontSize: 11, color: '#e1e1e6',
            }}
              formatter={(v) => (typeof v === 'number' ? `${v.toFixed(2)} km` : v)}
              labelFormatter={(l) => `t = ${l} min`} />
            {drawOrder.map((s) => (
              <Line key={s.id} type="monotone" dataKey={s.id}
                    stroke={s.color}
                    strokeWidth={s.id === selectedId ? 2.4 : 1.2}
                    strokeOpacity={s.id === selectedId ? 1 : 0.75}
                    dot={false} isAnimationActive={false}
                    onClick={() => onSelect && onSelect(s.id)} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
