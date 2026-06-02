import { useEffect, useState, useCallback } from 'react';
import { Send } from 'lucide-react';
import { api } from '../../../services/api';

/* A small command library — operator picks one, reviews, sends. */
const COMMAND_LIBRARY = [
  { id: 'ADCS_NADIR', label: 'Set attitude: nadir', detail: 'Point payload toward Earth' },
  { id: 'ADCS_SUN', label: 'Set attitude: sun-pointing', detail: 'Maximise solar input' },
  { id: 'PAYLOAD_ON', label: 'Payload power on', detail: 'Energise imaging payload' },
  { id: 'PAYLOAD_OFF', label: 'Payload power off', detail: 'De-energise payload' },
  { id: 'DOWNLINK_START', label: 'Begin downlink', detail: 'Start data downlink in contact' },
  { id: 'HEATER_ON', label: 'Battery heater on', detail: 'Engage battery heater' },
];

/* ── Command stack ────────────────────────────────────────────── */

export function CommandStackPanel() {
  const [selected, setSelected] = useState(COMMAND_LIBRARY[0].id);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const data = await api.getCommandSequences();
    if (data?.log) setHistory(data.log.slice(0, 12));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const send = useCallback(async () => {
    const cmd = COMMAND_LIBRARY.find((c) => c.id === selected);
    setBusy(true);
    const res = await api.sendCommand(cmd.id);
    setBusy(false);
    setHistory((prev) => [{
      timestamp: new Date().toISOString(),
      action: 'ADHOC',
      detail: `${cmd.id} -> ${res?.status || 'SENT'}`,
    }, ...prev].slice(0, 12));
  }, [selected]);

  const sel = COMMAND_LIBRARY.find((c) => c.id === selected);

  return (
    <div>
      <div className="c3-field">
        <label>Command</label>
        <select className="c3-select" value={selected}
                onChange={(e) => setSelected(e.target.value)}>
          {COMMAND_LIBRARY.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>
      <div style={{ fontSize: 11, color: 'var(--c3-text-3)', marginBottom: 8 }}>
        {sel?.detail}
      </div>
      <button className="c3-btn" disabled={busy} onClick={send}>
        <Send size={11} style={{ marginRight: 5, verticalAlign: -1 }} />
        Review &amp; send
      </button>

      <div style={{ marginTop: 12, fontSize: 10.5, color: 'var(--c3-text-3)' }}>
        Command history
      </div>
      <table className="c3-table" style={{ marginTop: 4 }}>
        <tbody>
          {history.length === 0 && (
            <tr><td className="unit">No commands sent.</td></tr>
          )}
          {history.map((h, i) => (
            <tr key={i}>
              <td className="c3-mono unit" style={{ width: 64 }}>
                {(h.timestamp || '').slice(11, 19)}
              </td>
              <td className="c3-mono" style={{ fontSize: 11 }}>{h.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Event log ────────────────────────────────────────────────── */

export function EventLogPanel({ alerts }) {
  const rows = (alerts || []).slice(0, 60);
  if (rows.length === 0) {
    return <div className="c3-empty-grid">No events. System nominal.</div>;
  }
  return (
    <table className="c3-table">
      <tbody>
        {rows.map((a, i) => {
          const sev = a.severity === 'CRITICAL' ? 'alarm' : 'warn';
          return (
            <tr key={i} className={`c3-logrow ${sev}`}>
              <td className="c3-mono unit" style={{ width: 62 }}>
                {(a.timestamp || '').slice(11, 19)}
              </td>
              <td className={sev === 'alarm' ? 'c3-st-alarm' : 'c3-st-warning'}
                  style={{ width: 56, fontSize: 10.5 }}>
                {a.severity === 'CRITICAL' ? 'Alarm' : 'Warning'}
              </td>
              <td style={{ fontSize: 11.5 }}>
                {a.message || `${a.parameter} out of limit`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ── Ground contacts & next passes ────────────────────────────── */

export function GroundContactsPanel() {
  const [passes, setPasses] = useState([]);

  useEffect(() => {
    const refresh = async () => {
      const data = await api.getGroundStationPasses();
      if (data?.passes) setPasses(data.passes.slice(0, 12));
    };
    refresh();
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, []);

  if (passes.length === 0) {
    return <div className="c3-empty-grid">No upcoming passes computed yet.</div>;
  }
  return (
    <table className="c3-table">
      <thead>
        <tr><th>Station</th><th>AOS</th><th>Dur</th><th style={{ textAlign: 'right' }}>Max el</th></tr>
      </thead>
      <tbody>
        {passes.map((p, i) => (
          <tr key={i}>
            <td style={{ fontSize: 11.5 }}>{p.station_name}</td>
            <td className="c3-mono unit">{(p.aos_time || '').slice(11, 16)}</td>
            <td className="c3-mono unit">{Math.round((p.duration_sec || 0) / 60)}m</td>
            <td className="val">{Math.round(p.max_elevation_deg || 0)}°</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
