import { useMemo } from 'react';
import {
  ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, CartesianGrid,
  ReferenceLine, Tooltip, Scatter,
} from 'recharts';

/*
 * RiskTrend — stacked-by-subsystem risk over time + anomaly markers.
 *
 *   X: time (UTC)
 *   Y: risk score (0..1) — bands stacked, top = total risk
 *   Triangle markers = rule firings
 *   Red dashed line = autonomy action threshold
 *
 * Props:
 *   samples: [{ t, risk, Power, Thermal, Comms, Storage, Orbit, ... }]
 *   anomalies: [{ t, rule_id, severity }]
 */

const BANDS = [
  { key: 'Power',   color: '#4a6f93' },
  { key: 'Thermal', color: '#b39148' },
  { key: 'Comms',   color: '#6b9c7c' },
  { key: 'Storage', color: '#7e7e87' },
  { key: 'Orbit',   color: '#b06560' },
];

const TRIGGER = 0.6;

export default function RiskTrend({ samples = [], anomalies = [] }) {
  const data = useMemo(() => samples.map((s) => ({
    ...s,
    t_ms: new Date(s.t).getTime(),
  })), [samples]);

  const markers = useMemo(() => anomalies.map((a) => ({
    t_ms: new Date(a.t).getTime(),
    y: 0.95,
    rule_id: a.rule_id,
  })), [anomalies]);

  const fmtT = (ms) => {
    const d = new Date(ms);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  };

  if (!data.length) {
    return <div className="mon-empty">Risk trend will appear once the live feed produces samples.</div>;
  }

  return (
    <div className="mon-chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 6, right: 12, bottom: 22, left: 30 }}>
          <CartesianGrid stroke="#1f1f23" vertical={false} />
          <XAxis dataKey="t_ms" type="number" domain={['dataMin', 'dataMax']}
                 tickFormatter={fmtT}
                 tick={{ fill: '#7e7e87', fontSize: 9 }}
                 label={{ value: 'UTC', position: 'insideBottom', offset: -6,
                          fill: '#7e7e87', fontSize: 9 }} />
          <YAxis domain={[0, 1]}
                 tick={{ fill: '#7e7e87', fontSize: 9 }}
                 label={{ value: 'risk', angle: -90, position: 'insideLeft',
                          offset: 12, fill: '#7e7e87', fontSize: 9 }} />
          <Tooltip contentStyle={{
            background: '#080808', border: '1px solid #1f1f23',
            fontSize: 10, color: '#c8c8cc',
          }} labelFormatter={(v) => fmtT(v)} />
          {BANDS.map((b, i) => (
            <Area key={b.key} type="monotone" dataKey={b.key}
                  stackId="risk"
                  stroke="none" fill={b.color} fillOpacity={0.65}
                  isAnimationActive={false} />
          ))}
          <ReferenceLine y={TRIGGER} stroke="#b06560"
                         strokeDasharray="4 3" strokeWidth={1}
                         label={{ value: 'action trigger', fill: '#b06560',
                                  fontSize: 9, position: 'right' }} />
          {markers.length > 0 && (
            <Scatter dataKey="y" data={markers}
                     shape="triangle" fill="#c6a04e" />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export const RISK_BANDS = BANDS;   // re-exported for the legend
