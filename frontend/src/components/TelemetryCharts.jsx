import { useEffect, useState, memo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, ReferenceLine, Tooltip,
} from 'recharts';

/*
 * TelemetryCharts — replaces the static "Telemetry Insights" sparkbars
 * with real-time strip charts for the parameters operators actually
 * watch during a pass:
 *
 *   Battery SOC (%) · low-SOC limit at 20%
 *   SNR (dB)        · minimum-link limit at 5 dB
 *   Solar (A)
 *   Battery temp °C · warn @ 35, crit @ 40
 *   Power margin W  · warn @ 0
 *
 * Each chart is a rolling 5-min window (120 samples at the 2 s tick),
 * with limit reference lines and trace color shifted to amber/red
 * when the latest sample breaches a limit. Charts are calm by design —
 * thin lines, no glow, muted palette, restrained tooltip.
 */

const WINDOW = 120;       // samples (≈ 4 min at 2 s tick)
const STROKE = 1.4;
const PALETTE = {
  nominal: '#6b8fb5',     // calm teal-blue
  warn:    '#c6a04e',     // muted amber
  crit:    '#c75f5f',     // muted red
  axis:    '#7a7a83',
  grid:    '#26262c',
};

function pickColor(value, warn, crit) {
  if (crit != null && value <= crit) return PALETTE.crit;
  if (warn != null && value <= warn) return PALETTE.warn;
  return PALETTE.nominal;
}

function pickColorHigh(value, warn, crit) {
  if (crit != null && value >= crit) return PALETTE.crit;
  if (warn != null && value >= warn) return PALETTE.warn;
  return PALETTE.nominal;
}

function fmt(v, d = 1) {
  if (v == null || Number.isNaN(v)) return '—';
  return Number(v).toFixed(d);
}

function StripChart({
  title, unit, data, color,
  yDomain, warnLine, critLine,
  digits = 1,
}) {
  const last = data.length ? data[data.length - 1].v : null;
  return (
    <div className="tc-strip">
      <div className="tc-strip-head">
        <span className="tc-strip-title">{title}</span>
        <span className="tc-strip-value mono" style={{ color }}>
          {fmt(last, digits)}<span className="tc-strip-unit"> {unit}</span>
        </span>
      </div>
      <div className="tc-strip-canvas">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 22 }}>
            <CartesianGrid stroke={PALETTE.grid} vertical={false} />
            <XAxis dataKey="t" hide />
            <YAxis
              domain={yDomain}
              tick={{ fill: PALETTE.axis, fontSize: 9 }}
              width={28}
              tickCount={3}
            />
            {warnLine != null && (
              <ReferenceLine y={warnLine} stroke={PALETTE.warn}
                             strokeDasharray="3 3" strokeWidth={1} />
            )}
            {critLine != null && (
              <ReferenceLine y={critLine} stroke={PALETTE.crit}
                             strokeDasharray="3 3" strokeWidth={1} />
            )}
            <Tooltip
              contentStyle={{
                background: '#16161a', border: '1px solid #2a2a30',
                fontSize: 10, color: '#d9d9de', padding: '3px 6px',
              }}
              labelFormatter={() => ''}
              formatter={(v) => [`${fmt(v, digits)} ${unit}`, title]}
            />
            <Line
              type="monotone" dataKey="v" stroke={color}
              strokeWidth={STROKE} dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const EMPTY_HIST = Object.freeze({
  battery: [], snr: [], solar: [], batt_temp: [], power_margin: [],
});

// Append immutably so the history object is a fresh reference each tick
// (Vite + React dev freezes useRef initial values, which broke the
// previous mutate-in-place approach with "object is not extensible").
function appendSample(arr, t, v) {
  if (v == null) return arr;
  const sample = { t, v: Number(v) };
  if (arr.length >= WINDOW) return [...arr.slice(1), sample];
  return [...arr, sample];
}

const TelemetryCharts = memo(function TelemetryCharts({ telemetry }) {
  const [hist, setHist] = useState(EMPTY_HIST);

  useEffect(() => {
    if (!telemetry) return;
    const t = Date.now();
    // Power margin: synthesised from current SOC vs reserve floor.
    // If the backend exposes a real margin field later, swap it in here.
    const margin = telemetry.power_margin_wh != null
      ? telemetry.power_margin_wh
      : (telemetry.battery_pct != null && telemetry.max_battery_wh != null
          ? (telemetry.battery_pct - 20) / 100 * telemetry.max_battery_wh
          : null);
    setHist((cur) => ({
      battery:      appendSample(cur.battery,      t, telemetry.battery_pct),
      snr:          appendSample(cur.snr,          t, telemetry.snr_db),
      solar:        appendSample(cur.solar,        t, telemetry.solar_panel_current_a),
      batt_temp:    appendSample(cur.batt_temp,    t, telemetry.battery_temp_c),
      power_margin: appendSample(cur.power_margin, t, margin),
    }));
  }, [telemetry]);

  if (!telemetry) return null;

  const h = hist;
  const battColor = pickColor(telemetry.battery_pct, 40, 20);
  const snrColor = pickColor(telemetry.snr_db, 8, 5);
  const tempColor = pickColorHigh(telemetry.battery_temp_c, 35, 40);
  const marginColor = h.power_margin.length
    ? pickColor(h.power_margin[h.power_margin.length - 1].v, 100, 0)
    : PALETTE.nominal;

  return (
    <div className="ap-card tc-wrap">
      <div className="ap-card-header">
        <span>TELEMETRY · LIVE STRIP CHARTS</span>
        <span className="tc-window mono">last {WINDOW} samples</span>
      </div>
      <div className="tc-grid">
        <StripChart
          title="Battery SOC" unit="%"
          data={h.battery} color={battColor}
          yDomain={[0, 100]} warnLine={40} critLine={20}
          digits={1}
        />
        <StripChart
          title="SNR" unit="dB"
          data={h.snr} color={snrColor}
          yDomain={['auto', 'auto']} warnLine={8} critLine={5}
          digits={1}
        />
        <StripChart
          title="Solar" unit="A"
          data={h.solar} color={PALETTE.nominal}
          yDomain={[0, 'auto']}
          digits={2}
        />
        <StripChart
          title="Battery temp" unit="°C"
          data={h.batt_temp} color={tempColor}
          yDomain={['auto', 'auto']} warnLine={35} critLine={40}
          digits={1}
        />
        <StripChart
          title="Power margin" unit="Wh"
          data={h.power_margin} color={marginColor}
          yDomain={['auto', 'auto']} warnLine={0}
          digits={0}
        />
      </div>
    </div>
  );
});

export default TelemetryCharts;
