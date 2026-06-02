import { useMemo } from 'react';
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar,
} from 'recharts';

/*
 * SubsystemHealthRadar — 8-axis spider chart, one polygon per series.
 *
 *   Current state (filled, teal) vs Nominal envelope (outline, dim).
 *   Axes turn amber/red when health drops below thresholds.
 *
 * Props:
 *   health        — { Power, Thermal, Comms, ADCS, Payload, EPS, Storage, Orbit } in 0..100
 *   envelope      — same shape, the "nominal" target outline
 *   highlightAxis — optional subsystem name to brighten (from hovered card)
 */

const AXES = ['Power', 'Thermal', 'Comms', 'ADCS', 'Payload', 'EPS', 'Storage', 'Orbit'];

export default function SubsystemHealthRadar({ health = {}, envelope = {}, highlightAxis }) {
  const data = useMemo(() => AXES.map((k) => ({
    axis: k,
    current: Number(health[k] ?? 0),
    envelope: Number(envelope[k] ?? 90),
  })), [health, envelope]);

  const tick = (props) => {
    const { x, y, payload, textAnchor } = props;
    const v = health[payload.value] ?? 0;
    const color = v < 40 ? '#b06560' : v < 70 ? '#b39148' : '#8a8a93';
    const isHi  = highlightAxis === payload.value;
    return (
      <text x={x} y={y} dy={3} textAnchor={textAnchor}
            fill={isHi ? '#c8c8cc' : color}
            fontFamily="Poppins, sans-serif"
            fontSize={isHi ? 10.5 : 9.5}
            fontWeight={isHi ? 600 : 400}>
        {payload.value}
      </text>
    );
  };

  return (
    <div className="mon-radar-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="78%">
          <PolarGrid stroke="#1f1f23" strokeDasharray="2 3" />
          <PolarAngleAxis dataKey="axis" tick={tick} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          {/* Nominal envelope — outlined only */}
          <Radar name="Nominal" dataKey="envelope"
                 stroke="#3a4a5e" fill="#3a4a5e" fillOpacity={0.05}
                 strokeWidth={1} strokeDasharray="3 3" />
          {/* Current — filled */}
          <Radar name="Current" dataKey="current"
                 stroke="#4a6f93" fill="#4a6f93" fillOpacity={0.28}
                 strokeWidth={1.6} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
