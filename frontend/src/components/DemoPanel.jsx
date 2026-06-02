import { useCallback, useEffect, useState } from 'react';
import { Zap, Square, RotateCcw, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { api } from '../services/api';

/**
 * DemoPanel — docked operator control surface for the stage demo.
 * Hidden from normal use; mounted only when ?demo=true is on the URL.
 *
 * Shows: three preset scenarios, intensity selector, cancel / reset
 * buttons, and a live summary of the active run (elapsed, expected vs
 * actual AI / rule / autonomy timing).
 */
export default function DemoPanel() {
  const [scenarios, setScenarios] = useState([]);
  const [status, setStatus] = useState({ active: [], recent_completed: [] });
  const [intensity, setIntensity] = useState(1.0);
  const [lastInjection, setLastInjection] = useState(null);
  const [busy, setBusy] = useState(false);

  // Initial load of scenario presets
  useEffect(() => {
    let mounted = true;
    api.getDemoScenarios().then((r) => {
      if (mounted && r?.scenarios) setScenarios(r.scenarios);
    });
    return () => { mounted = false; };
  }, []);

  // Poll status at 1 Hz to mirror the tick loop
  useEffect(() => {
    const tick = async () => {
      const s = await api.getDemoStatus();
      if (s) setStatus(s);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const trigger = useCallback(async (scenarioId) => {
    setBusy(true);
    const r = await api.injectAnomaly(scenarioId, intensity);
    setBusy(false);
    if (r) setLastInjection(r);
  }, [intensity]);

  const cancelRun = useCallback(async (runId) => {
    setBusy(true);
    await api.cancelDemoRun(runId);
    setBusy(false);
  }, []);

  const resetAll = useCallback(async () => {
    setBusy(true);
    await api.resetDemo();
    setLastInjection(null);
    setBusy(false);
  }, []);

  const activeRun = status.active[0] || null;
  const activeSpec = activeRun
    ? scenarios.find((s) => s.scenario_id === activeRun.scenario_id)
    : null;

  return (
    <div className="demo-panel" style={panelStyle}>
      <div style={headerStyle}>
        <Zap size={12} /> <span>DEMO CONTROL</span>
        <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: 10 }}>
          ?demo=true
        </span>
      </div>

      {/* Intensity slider */}
      <div style={{ padding: '6px 10px', borderBottom: '1px solid #1a1a1a' }}>
        <label style={{ fontSize: 10, opacity: 0.7 }}>
          Intensity: <strong>{intensity.toFixed(2)}</strong>
        </label>
        <input
          type="range"
          min={0.2} max={1.0} step={0.05}
          value={intensity}
          onChange={(e) => setIntensity(parseFloat(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>

      {/* Scenario buttons */}
      <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {scenarios.map((s) => (
          <button
            key={s.scenario_id}
            disabled={busy || (activeRun && activeRun.scenario_id !== s.scenario_id)}
            onClick={() => trigger(s.scenario_id)}
            style={{
              ...buttonStyle,
              background:
                activeRun?.scenario_id === s.scenario_id ? '#2c1a1a' : '#0e0e0e',
              borderColor:
                activeRun?.scenario_id === s.scenario_id ? '#c44' : '#222',
            }}
            title={s.description}
          >
            <div style={{ fontSize: 11, fontWeight: 600 }}>{s.name}</div>
            <div style={{ fontSize: 9, opacity: 0.6, marginTop: 2 }}>
              AI ≤ {s.expected_ai_catch_sec}s · rules @ {s.expected_rule_catch_sec}s
            </div>
          </button>
        ))}
      </div>

      {/* Active run summary */}
      {activeRun && (
        <div style={{ padding: 10, borderTop: '1px solid #222', background: '#0a0a0a' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={11} />
            <strong style={{ fontSize: 11 }}>{activeSpec?.name || activeRun.scenario_id}</strong>
            <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: 10 }}>
              {activeRun.state}
            </span>
          </div>
          <div style={{ fontSize: 10, marginTop: 4 }}>
            Elapsed: <strong>{activeRun.elapsed_sec.toFixed(1)}s</strong>
          </div>
          <EventRow
            label="AI flagged"
            actual={activeRun.triggered_events.ai_catch_sec}
            expected={activeSpec?.expected_ai_catch_sec}
          />
          <EventRow
            label="AI critical"
            actual={activeRun.triggered_events.ai_critical_sec}
            expected={null}
          />
          <EventRow
            label="Rule fired"
            actual={activeRun.triggered_events.rule_catch_sec}
            expected={activeSpec?.expected_rule_catch_sec}
          />
          <EventRow
            label="Autonomy reacted"
            actual={activeRun.triggered_events.autonomy_react_sec}
            expected={activeSpec?.expected_autonomy_react_sec}
          />

          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              disabled={busy || activeRun.state !== 'active'}
              onClick={() => cancelRun(activeRun.run_id)}
              style={{ ...miniButton, color: '#fc6' }}
            >
              <Square size={10} /> Cancel
            </button>
            <button
              disabled={busy}
              onClick={resetAll}
              style={{ ...miniButton, color: '#f99' }}
            >
              <RotateCcw size={10} /> Reset all
            </button>
          </div>
        </div>
      )}

      {/* Last completed run summary */}
      {!activeRun && status.recent_completed?.length > 0 && (
        <div style={{ padding: 10, borderTop: '1px solid #222' }}>
          <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 4 }}>
            Last completed
          </div>
          {status.recent_completed.slice(-1).map((r) => (
            <CompletedSummary key={r.run_id} run={r} scenarios={scenarios} />
          ))}
        </div>
      )}

      {/* AI warning surface */}
      {lastInjection?.ai_warning && (
        <div style={{ padding: 8, background: '#3a2a00', fontSize: 10, color: '#fc6' }}>
          <AlertTriangle size={10} /> {lastInjection.ai_warning}
        </div>
      )}
    </div>
  );
}

function EventRow({ label, actual, expected }) {
  const fired = actual !== null && actual !== undefined;
  return (
    <div style={{ display: 'flex', fontSize: 10, marginTop: 2 }}>
      <span style={{ width: 100, opacity: 0.7 }}>{label}</span>
      <span style={{ flex: 1, color: fired ? '#7c7' : '#555' }}>
        {fired ? `T+${actual.toFixed(1)}s` : '—'}
      </span>
      {expected !== null && expected !== undefined && (
        <span style={{ opacity: 0.4, fontSize: 9 }}>(exp {expected}s)</span>
      )}
    </div>
  );
}

function CompletedSummary({ run, scenarios }) {
  const spec = scenarios.find((s) => s.scenario_id === run.scenario_id);
  const ev = run.triggered_events;
  const aiBeatRules =
    ev.ai_catch_sec !== null &&
    ev.rule_catch_sec !== null &&
    ev.ai_catch_sec < ev.rule_catch_sec;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600 }}>{spec?.name || run.scenario_id}</div>
      <div style={{ fontSize: 10, marginTop: 4 }}>
        AI: <strong>{ev.ai_catch_sec ? `T+${ev.ai_catch_sec}s` : '—'}</strong> ·
        Rules: <strong>{ev.rule_catch_sec ? `T+${ev.rule_catch_sec}s` : '—'}</strong> ·
        Autonomy: <strong>{ev.autonomy_react_sec ? `T+${ev.autonomy_react_sec}s` : '—'}</strong>
      </div>
      <div style={{ fontSize: 10, marginTop: 2, color: aiBeatRules ? '#7c7' : '#fc6' }}>
        {aiBeatRules ? <><CheckCircle size={9} /> AI caught before rules</> :
         <><AlertTriangle size={9} /> AI did not beat rules — review</>}
      </div>
    </div>
  );
}

const panelStyle = {
  position: 'fixed',
  right: 12,
  top: 70,
  width: 280,
  background: '#070707',
  border: '1px solid #222',
  borderRadius: 4,
  color: '#ccc',
  fontFamily: 'Poppins, sans-serif',
  zIndex: 100,
  boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 10px',
  borderBottom: '1px solid #222',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.05em',
  color: '#fff',
};

const buttonStyle = {
  textAlign: 'left',
  padding: '8px 10px',
  border: '1px solid #222',
  borderRadius: 3,
  color: '#ddd',
  background: '#0e0e0e',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const miniButton = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  padding: '4px 6px',
  border: '1px solid #333',
  borderRadius: 3,
  background: '#0a0a0a',
  fontSize: 10,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
