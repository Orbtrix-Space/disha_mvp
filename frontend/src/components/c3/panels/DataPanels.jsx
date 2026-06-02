import { useEffect, useState } from 'react';
import { classify, worst, STATE_CLASS } from '../limits';

/* ── shared helpers ───────────────────────────────────────────── */

function fmt(v, digits = 1) {
  if (v == null || Number.isNaN(v)) return '—';
  return Number(v).toFixed(digits);
}

function StatePill({ state }) {
  return (
    <span className={`c3-pill ${STATE_CLASS[state] || 'c3-st-idle'}`}>
      {state}
    </span>
  );
}

function NoData() {
  return <div className="c3-empty-grid">No telemetry. Bring a satellite online.</div>;
}

/* Tiny SVG sparkline — no chart library, no decoration. */
function Spark({ values, w = 120, h = 28 }) {
  if (!values || values.length < 2) return <svg width={w} height={h} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / span) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={w} height={h}>
      <polyline points={pts} fill="none" stroke="#6b8fb5" strokeWidth="1" />
    </svg>
  );
}

/* ── Live telemetry ───────────────────────────────────────────── */

export function LiveTelemetryPanel({ telemetry }) {
  if (!telemetry) return <NoData />;
  const p = telemetry.power || {};
  const th = telemetry.thermal || {};
  const c = telemetry.comms || {};
  const a = telemetry.attitude || {};
  const s = telemetry.storage || {};

  const rows = [
    ['Battery SOC', p.battery_soc, '%', 'battery_soc'],
    ['Bus voltage', p.battery_voltage, 'V', 'battery_voltage'],
    ['Current draw', p.current_draw, 'A', null],
    ['Solar current', p.solar_current, 'A', null],
    ['Panel temp', th.component_temp, '°C', 'component_temp'],
    ['SNR', c.snr, 'dB', 'snr'],
    ['Data rate', c.data_rate, 'kbps', null],
    ['Pointing error', a.pointing_error, '°', 'pointing_error'],
    ['Angular rate', a.angular_rate, '°/s', 'angular_rate'],
    ['Storage used', s.storage_pct, '%', 'storage_pct'],
    ['Altitude', telemetry.altitude_km ?? telemetry.position?.altitude, 'km', null],
  ];

  return (
    <table className="c3-table">
      <thead>
        <tr><th>Parameter</th><th style={{ textAlign: 'right' }}>Value</th><th></th><th>State</th></tr>
      </thead>
      <tbody>
        {rows.map(([label, val, unit, param]) => {
          const st = param ? classify(param, val) : 'idle';
          return (
            <tr key={label}>
              <td>{label}</td>
              <td className={`val ${STATE_CLASS[st]}`}>{fmt(val, 2)}</td>
              <td className="unit">{unit}</td>
              <td>{param ? <StatePill state={st} /> : <span className="c3-st-idle">—</span>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ── Subsystem status ─────────────────────────────────────────── */

export function SubsystemStatusPanel({ telemetry, alerts }) {
  if (!telemetry) return <NoData />;
  const p = telemetry.power || {};
  const th = telemetry.thermal || {};
  const c = telemetry.comms || {};
  const a = telemetry.attitude || {};
  const s = telemetry.storage || {};

  // Alerts that mention each subsystem nudge it toward its worst rule state
  const alertSev = (kw) => {
    const hit = (alerts || []).find((al) =>
      (al.parameter || '').toLowerCase().includes(kw) ||
      (al.rule_id || '').toLowerCase().includes(kw));
    if (!hit) return 'idle';
    return hit.severity === 'CRITICAL' ? 'alarm' : 'warning';
  };

  const subsystems = [
    ['Power', worst([
      classify('battery_soc', p.battery_soc),
      classify('battery_voltage', p.battery_voltage),
      alertSev('batt'),
    ]), `${fmt(p.battery_soc, 1)}% · ${fmt(p.battery_voltage, 1)}V`],
    ['Thermal', worst([
      classify('component_temp', th.component_temp),
      classify('battery_temp', telemetry.battery_temp_c),
      alertSev('temp'),
    ]), `${fmt(th.component_temp, 1)}°C panel`],
    ['ADCS', worst([
      classify('pointing_error', a.pointing_error),
      classify('angular_rate', a.angular_rate),
      alertSev('point'),
    ]), `${a.mode || 'NADIR'} · ${fmt(a.pointing_error, 2)}°`],
    ['Comms', worst([
      classify('snr', c.snr),
      alertSev('snr'),
      c.link_status === 'NOMINAL' || c.link_status === 'NO_CONTACT' ? 'nominal' : 'warning',
    ]), c.link_status || '—'],
    ['OBC', 'nominal', 'Nominal'],
    ['Payload', telemetry.payload_status === 'ACTIVE' ? 'nominal' : 'idle',
      telemetry.payload_status || 'Idle'],
  ];

  return (
    <table className="c3-table">
      <tbody>
        {subsystems.map(([name, state, detail]) => (
          <tr key={name}>
            <td style={{ width: 70 }}>{name}</td>
            <td><StatePill state={state} /></td>
            <td className="unit" style={{ textAlign: 'right' }}>{detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── Power & battery ──────────────────────────────────────────── */

export function PowerBatteryPanel({ telemetry, telemetryHistory }) {
  if (!telemetry) return <NoData />;
  const p = telemetry.power || {};
  const socState = classify('battery_soc', p.battery_soc);
  const socHist = (telemetryHistory || [])
    .slice(-120)
    .map((f) => f.power?.battery_soc ?? f.battery_pct)
    .filter((v) => v != null);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className={`c3-num ${STATE_CLASS[socState]}`} style={{ fontSize: 30 }}>
          {fmt(p.battery_soc, 1)}
        </span>
        <span className="unit">% state of charge</span>
      </div>
      <Spark values={socHist} w={220} h={36} />
      <div style={{ marginTop: 6 }}>
        <div className="c3-kv"><span className="k">Bus voltage</span>
          <span className="v">{fmt(p.battery_voltage, 2)} V</span></div>
        <div className="c3-kv"><span className="k">Current draw</span>
          <span className="v">{fmt(p.current_draw, 2)} A</span></div>
        <div className="c3-kv"><span className="k">Solar current</span>
          <span className="v">{fmt(p.solar_current, 2)} A</span></div>
        <div className="c3-kv"><span className="k">Eclipse</span>
          <span className={`v ${p.in_eclipse ? 'c3-st-warning' : 'c3-st-nominal'}`}>
            {p.in_eclipse ? 'In eclipse' : 'Sunlit'}</span></div>
      </div>
    </div>
  );
}

/* ── Link status & SNR ────────────────────────────────────────── */

export function LinkStatusPanel({ telemetry, contactState }) {
  if (!telemetry) return <NoData />;
  const c = telemetry.comms || {};
  const linkUp = (contactState?.inContact) && c.link_status === 'NOMINAL';
  const snrState = classify('snr', c.snr);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <span className={`c3-dot ${linkUp ? 'live' : c.link_status === 'DEGRADED' ? 'warn' : ''}`} />
        <span style={{ fontSize: 13 }}>{c.link_status || 'NO_CONTACT'}</span>
      </div>
      <div className="c3-kv"><span className="k">SNR</span>
        <span className={`v ${STATE_CLASS[snrState]}`}>{fmt(c.snr, 1)} dB</span></div>
      <div className="c3-kv"><span className="k">Data rate</span>
        <span className="v">{fmt(c.data_rate, 0)} kbps</span></div>
      <div className="c3-kv"><span className="k">Ground station</span>
        <span className="v">{contactState?.station || c.nearest_station || '—'}</span></div>
      <div className="c3-kv"><span className="k">Elevation</span>
        <span className="v">{fmt(contactState?.elevationDeg, 1)}°</span></div>
      <div className="c3-kv"><span className="k">Source</span>
        <span className="v">{contactState?.source || telemetry.source || '—'}</span></div>
    </div>
  );
}

/* ── Mission clock & pass timer ───────────────────────────────── */

export function MissionClockPanel({ telemetry, passes }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const utc = new Date(now).toISOString().replace('T', ' ').slice(0, 19);
  const nextPass = (passes || [])
    .map((p) => ({ ...p, t: new Date(p.aos_time).getTime() }))
    .filter((p) => p.t > now)
    .sort((a, b) => a.t - b.t)[0];

  const fmtCountdown = (ms) => {
    if (ms == null) return '—';
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  };

  return (
    <div>
      <div className="c3-kv"><span className="k">UTC</span>
        <span className="v">{utc}</span></div>
      <div className="c3-kv"><span className="k">Sim epoch</span>
        <span className="v">{telemetry?.timestamp ? telemetry.timestamp.slice(11, 19) : '—'}</span></div>
      <div style={{ borderTop: '1px solid var(--c3-border)', margin: '8px 0' }} />
      <div className="c3-kv"><span className="k">Next pass</span>
        <span className="v">{nextPass ? nextPass.station_name : '—'}</span></div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
        <span className="c3-num" style={{ fontSize: 26 }}>
          {fmtCountdown(nextPass ? nextPass.t - now : null)}
        </span>
        <span className="unit">to AOS</span>
      </div>
    </div>
  );
}
