/*
 * DISHA — MONITOR (NETRA)
 *
 * Sidebar: Telemetry Ingestion · NETRA Assistant · Rule Set
 * Sub-nav: Live · Analytics
 *
 * The page is one file because the two views lean on the same shared
 * state (snapshot, history, rule groups). Heavier visualizations live
 * in src/components/monitor/.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, MessageSquare, Sliders, Send, ChevronDown,
  Upload as UploadIcon, Play, Pause,
} from 'lucide-react';
import { api } from '../services/api';
import SubsystemHealthRadar from '../components/monitor/SubsystemHealthRadar';
import RiskTrend, { RISK_BANDS } from '../components/monitor/RiskTrend';
import RuleSankey from '../components/monitor/RuleSankey';
import {
  RuleFiringHeatmap, AnomalyTimeline, StabilityTrend,
  StateFlowHistory, SubsystemTrendGrid,
} from '../components/monitor/AnalyticsCharts';

/* ───── utils ─────────────────────────────────────────────── */
const fmt = (n, d = 1) => (n == null ? '—' : Number(n).toFixed(d));
const fmtTime = (iso) => (iso ? iso.slice(11, 19) : '—');

/* ───── Sidebar: collapsible section shell ────────────────── */
function Accordion({ id, title, status, defaultOpen = true, children }) {
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(`disha.monitor.${id}.open`);
      return v == null ? defaultOpen : v === '1';
    } catch { return defaultOpen; }
  });
  useEffect(() => {
    try { localStorage.setItem(`disha.monitor.${id}.open`, open ? '1' : '0'); } catch {}
  }, [id, open]);
  return (
    <section className={`mon-acc ${open ? 'open' : ''}`}>
      <button className="mon-acc-head" onClick={() => setOpen((v) => !v)}>
        <ChevronDown size={11} className="mon-acc-chev" />
        <span className="mon-acc-title">{title}</span>
        {status}
      </button>
      {open && <div className="mon-acc-body">{children}</div>}
    </section>
  );
}

/* ───── A. Telemetry Ingestion ──────────────────────────── */
function TelemetryIngestion() {
  const [mode, setMode] = useState('live');
  const [url, setUrl] = useState('Demo feed');
  const [hz, setHz] = useState(1);
  const [connected, setConnected] = useState(true);   // live demo always connected
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [paste, setPaste] = useState('');
  const [pktDef, setPktDef] = useState('default');
  const [pktDefs, setPktDefs] = useState([{ id: 'default', name: 'Default TM frame' }]);

  // Pick up packet definitions from CONTROL's localStorage so this list
  // reuses the schemas the operator authored elsewhere.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('disha.tc.packet_definitions');
      const parsed = raw ? JSON.parse(raw) : [];
      const tm = parsed.filter((p) => p.kind === 'tm');
      if (tm.length) {
        setPktDefs([{ id: 'default', name: 'Default TM frame' }, ...tm.map((p) => ({ id: p.id, name: p.name }))]);
      }
    } catch {}
  }, []);

  const statusChip = (
    <span className={`mon-chip mon-chip-${
      mode === 'live'   ? (connected ? 'ok' : 'muted') :
      mode === 'replay' ? (paused ? 'warn' : 'ok') :
      'muted'
    }`}>
      {mode === 'live'   ? (connected ? `live · ${hz} Hz` : 'idle') :
       mode === 'replay' ? (paused ? 'replay · paused' : `replay · ${speed}×`) :
       'idle'}
    </span>
  );

  return (
    <Accordion id="ingest" title="Telemetry ingestion"
               status={statusChip} defaultOpen={true}>
      <div className="mon-mode-tabs">
        {['live', 'replay', 'paste'].map((m) => (
          <button key={m}
                  className={`mon-mode-btn ${mode === m ? 'on' : ''}`}
                  onClick={() => setMode(m)}>
            {m === 'live' ? 'Live stream' : m === 'replay' ? 'Replay file' : 'Paste'}
          </button>
        ))}
      </div>

      {mode === 'live' && (
        <>
          <label className="mon-label">Source</label>
          <input className="mon-input mono" value={url}
                 onChange={(e) => setUrl(e.target.value)} />
          <div className="mon-row2">
            <div>
              <label className="mon-label">Rate (Hz)</label>
              <input className="mon-input mono" value={hz}
                     onChange={(e) => setHz(parseFloat(e.target.value) || 1)} />
            </div>
            <button className="mon-secondary"
                    onClick={() => setConnected((v) => !v)}>
              {connected ? 'Disconnect' : 'Connect'}
            </button>
          </div>
        </>
      )}

      {mode === 'replay' && (
        <>
          <label className="mon-secondary mon-file">
            <UploadIcon size={11} />
            <span>Upload CSV / NDJSON / CCSDS</span>
            <input type="file" accept=".csv,.ndjson,.json,.bin" hidden />
          </label>
          <div className="mon-replay-ctrls">
            <button className="mon-secondary" onClick={() => setPaused((v) => !v)}>
              {paused ? <Play size={11} /> : <Pause size={11} />}
              {paused ? 'Play' : 'Pause'}
            </button>
            <div className="mon-speeds">
              {[1, 4, 16].map((s) => (
                <button key={s}
                        className={`mon-speed ${speed === s ? 'on' : ''}`}
                        onClick={() => setSpeed(s)}>{s}×</button>
              ))}
            </div>
          </div>
        </>
      )}

      {mode === 'paste' && (
        <>
          <label className="mon-label">Paste telemetry frames</label>
          <textarea className="mon-input mon-textarea-bounded mono"
                    rows={6} value={paste}
                    placeholder={'epoch,channel,value\n2026-06-02T00:00:00Z,battery_pct,99.7'}
                    onChange={(e) => setPaste(e.target.value)} />
        </>
      )}

      <label className="mon-label">Packet definition</label>
      <select className="mon-input mon-select" value={pktDef}
              onChange={(e) => setPktDef(e.target.value)}>
        {pktDefs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </Accordion>
  );
}

/* ───── B. NETRA Assistant ──────────────────────────────── */
function NetraAssistant() {
  const [prompts, setPrompts] = useState([]);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    api.netraSuggestions().then((r) => setPrompts(r?.prompts || []));
  }, []);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs]);

  const ask = useCallback(async (question) => {
    if (!question.trim() || busy) return;
    setBusy(true);
    setMsgs((m) => [...m, { role: 'user', text: question }]);
    setInput('');
    const r = await api.netraChat(question);
    setMsgs((m) => [...m, {
      role: 'assistant',
      text: r.answer,
      citations: r.citations,
      intent: r.intent,
    }]);
    setBusy(false);
  }, [busy]);

  return (
    <Accordion id="netra" title="NETRA assistant" defaultOpen={true}
               status={<span className="mon-chip mon-chip-ok">operational</span>}>
      <div className="mon-netra-prompts">
        {prompts.map((p) => (
          <button key={p} className="mon-prompt-chip" onClick={() => ask(p)}>
            {p}
          </button>
        ))}
      </div>
      <div className="mon-netra-chat" ref={scrollRef}>
        {msgs.length === 0 && (
          <div className="mon-netra-empty">
            Ask about current telemetry, recent rule firings, or autonomy
            decisions. Answers are grounded in the rolling snapshot.
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`mon-msg mon-msg-${m.role}`}>
            <div className="mon-msg-text"
                 dangerouslySetInnerHTML={{ __html: m.text.replace(
                   /\*\*([^*]+)\*\*/g,
                   '<strong>$1</strong>'
                 ) }} />
            {m.citations?.length > 0 && (
              <ul className="mon-msg-cites">
                {m.citations.map((c, j) => (
                  <li key={j} className="mono">• {c}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <form className="mon-netra-form"
            onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        <input className="mon-input mono" value={input}
               placeholder="Ask NETRA…"
               onChange={(e) => setInput(e.target.value)} />
        <button type="submit" className="mon-secondary" disabled={busy || !input.trim()}>
          <Send size={11} /> Send
        </button>
      </form>
    </Accordion>
  );
}

/* ───── C. Rule Set ─────────────────────────────────────── */
function RuleSet() {
  const [groups, setGroups] = useState([]);
  const [enabled, setEnabled] = useState({});
  useEffect(() => {
    api.getRuleGroups().then((r) => {
      const gs = r?.groups || [];
      setGroups(gs);
      setEnabled(Object.fromEntries(gs.map((g) => [g.name, true])));
    });
  }, []);
  const totalRules = groups.reduce((s, g) => s + (g.rules?.length || 0), 0);
  return (
    <Accordion id="ruleset" title="Rule set" defaultOpen={false}
               status={<span className="mon-chip mon-chip-muted">{totalRules} rules</span>}>
      <ul className="mon-rule-groups">
        {groups.map((g) => (
          <li key={g.name} className="mon-rule-group">
            <label className="mon-toggle">
              <input type="checkbox"
                     checked={enabled[g.name] ?? true}
                     onChange={(e) => setEnabled((v) => ({ ...v, [g.name]: e.target.checked }))} />
              <span className="mon-rule-name">{g.name}</span>
            </label>
            <span className="mon-rule-count mono">{g.rules.length}</span>
            {g.firing_count_15m > 0 && (
              <span className="mon-rule-firing mono">×{g.firing_count_15m}</span>
            )}
          </li>
        ))}
        {groups.length === 0 && (
          <li className="mon-empty">No rule groups loaded.</li>
        )}
      </ul>
    </Accordion>
  );
}

/* ───── Live tab ────────────────────────────────────────── */
function LiveView({ snapshot, riskHistory, anomalies, sankey, alerts }) {
  const [hoverAxis, setHoverAxis] = useState(null);
  const subsystems = [
    { key: 'Power',   value: snapshot?.subsystem_values?.battery_pct },
    { key: 'Thermal', value: snapshot?.subsystem_values?.battery_temp_c, unit: '°C' },
    { key: 'Comms',   value: snapshot?.subsystem_values?.snr_db, unit: 'dB' },
    { key: 'ADCS',    value: snapshot?.subsystem_values?.pointing_error, unit: '°' },
    { key: 'Payload', value: snapshot?.subsystem_values?.storage_pct ? (100 - snapshot.subsystem_values.storage_pct) : null, unit: '%' },
    { key: 'Storage', value: snapshot?.subsystem_values?.storage_pct, unit: '%' },
  ];
  const mode = snapshot?.mode || 'AUTONOMOUS';
  const stability = snapshot?.stability_index ?? 0;
  const risk = snapshot?.risk_score ?? 0;

  return (
    <div className="mon-live-grid">
      {/* Row 1 — Radar + state pill */}
      <div className="mon-card mon-radar-card">
        <div className="mon-card-head">
          <span>Subsystem health</span>
          <span className="mon-caption">
            current vs nominal envelope · axes redden as health drops
          </span>
        </div>
        <SubsystemHealthRadar
          health={snapshot?.subsystem_health}
          envelope={snapshot?.nominal_envelope}
          highlightAxis={hoverAxis}
        />
      </div>
      <div className="mon-card mon-state-card">
        <div className="mon-card-head">State</div>
        <div className={`mon-state-pill mon-state-${mode.toLowerCase()}`}>{mode}</div>
        <ul className="mon-kvs">
          <li><span>Risk</span><b className="mono">{fmt(risk, 2)}</b></li>
          <li><span>Stability</span><b className="mono">{fmt(stability, 0)} / 100</b></li>
          <li><span>Anomaly</span><b className="mono">{fmt(snapshot?.anomaly_score, 2)}</b></li>
        </ul>
      </div>

      {/* Row 2 — subsystem cards linked to radar */}
      <div className="mon-card mon-span-2">
        <div className="mon-card-head">Subsystem snapshot</div>
        <div className="mon-sub-grid">
          {subsystems.map((s) => {
            const health = snapshot?.subsystem_health?.[s.key] ?? 0;
            const cls = health < 40 ? 'crit' : health < 70 ? 'warn' : 'ok';
            return (
              <div key={s.key} className={`mon-sub-card mon-sub-${cls}`}
                   onMouseEnter={() => setHoverAxis(s.key)}
                   onMouseLeave={() => setHoverAxis(null)}>
                <div className="mon-sub-name">{s.key}</div>
                <div className="mon-sub-val mono">
                  {s.value == null ? '—' : fmt(s.value, 1)}
                  {s.unit && <span className="mon-sub-unit">{s.unit}</span>}
                </div>
                <div className="mon-sub-health mono">{Math.round(health)}/100</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Row 3 — Risk trend */}
      <div className="mon-card mon-span-2">
        <div className="mon-card-head">
          <span>Risk trend · last hour</span>
          <span className="mon-caption">
            bands stacked by subsystem contribution · ▲ marks rule firings
          </span>
        </div>
        <RiskTrend samples={riskHistory?.samples || []}
                   anomalies={anomalies?.events || []} />
        <ul className="mon-band-legend">
          {RISK_BANDS.map((b) => (
            <li key={b.key}>
              <span className="dot" style={{ background: b.color }} />
              <span>{b.key}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Row 4 — Sankey */}
      <div className="mon-card mon-span-2 mon-sankey-card">
        <div className="mon-card-head">
          <span>Decision trace · sensor → constraint → decision → action</span>
          <span className="mon-caption">flow widths = rule-firing counts · last 15 min</span>
        </div>
        <RuleSankey nodes={sankey?.nodes || []} links={sankey?.links || []} />
      </div>

      {/* Right column — Alerts + Event stream */}
      <div className="mon-card mon-alerts-card mon-span-2">
        <div className="mon-card-head">Live alerts · last 15 min</div>
        <ul className="mon-alerts">
          {(alerts || []).slice(0, 10).map((a, i) => (
            <li key={i} className={`mon-alert mon-sev-${(a.severity || 'INFO').toLowerCase()}`}>
              <span className="mon-alert-t mono">{fmtTime(a.timestamp)}</span>
              <span className="mon-alert-rule mono">{a.rule_id || '—'}</span>
              <span className="mon-alert-msg">{a.message}</span>
            </li>
          ))}
          {(!alerts || alerts.length === 0) && (
            <li className="mon-empty">No active alerts.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

/* ───── Analytics tab ─────────────────────────────────── */
function AnalyticsView({ heatmap, anomalies, stability, stateHistory, subTrend }) {
  return (
    <div className="mon-live-grid">
      <div className="mon-card mon-span-2">
        <div className="mon-card-head">
          <span>Rule firing heatmap · last 24h</span>
          <span className="mon-caption">rows = rules · cols = 5-min buckets · opacity = count</span>
        </div>
        <RuleFiringHeatmap heatmap={heatmap} />
      </div>

      <div className="mon-card mon-span-2">
        <div className="mon-card-head">
          <span>Anomaly timeline · last 60 min</span>
          <span className="mon-caption">click a marker for details</span>
        </div>
        <AnomalyTimeline events={anomalies?.events || []} minutes={anomalies?.minutes || 60} />
      </div>

      <div className="mon-card">
        <div className="mon-card-head">Stability index · last 60 min</div>
        <StabilityTrend samples={stability?.samples || []} />
      </div>

      <div className="mon-card">
        <div className="mon-card-head">Time in state · last 24h</div>
        <StateFlowHistory
          states={stateHistory?.states || []}
          totalSeconds={stateHistory?.total_seconds || 0}
        />
      </div>

      <div className="mon-card mon-span-2">
        <div className="mon-card-head">
          <span>Subsystem trends · last 24h</span>
          <span className="mon-caption">small-multiples · amber/red lines = limits</span>
        </div>
        <SubsystemTrendGrid samples={subTrend?.samples || []} />
      </div>
    </div>
  );
}

/* ───── Page shell ────────────────────────────────────── */
const TABS = [
  { id: 'live',      label: 'Live',      icon: <Activity size={11} /> },
  { id: 'analytics', label: 'Analytics', icon: <Sliders size={11} /> },
];

export default function MonitorPage({ alerts = [] }) {
  const [tab, setTab] = useState('live');
  const [snapshot, setSnapshot] = useState(null);
  const [riskHistory, setRiskHistory] = useState(null);
  const [anomalies, setAnomalies] = useState(null);
  const [sankey, setSankey] = useState(null);
  // Analytics-only payloads
  const [heatmap, setHeatmap] = useState(null);
  const [stability, setStability] = useState(null);
  const [stateHistory, setStateHistory] = useState(null);
  const [subTrend, setSubTrend] = useState(null);

  // Live polling — light cadence
  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      const [snap, risk, anom, sk] = await Promise.all([
        api.getMonitorSnapshot(),
        api.getRiskHistory(60),
        api.getAnomalies(60),
        api.getMonitorSankey(15),
      ]);
      if (!mounted) return;
      if (snap) setSnapshot(snap);
      if (risk) setRiskHistory(risk);
      if (anom) setAnomalies(anom);
      if (sk) setSankey(sk);
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  // Lazy-load analytics payloads when the tab is opened
  useEffect(() => {
    if (tab !== 'analytics') return;
    api.getFiringHeatmap(24, 5).then(setHeatmap);
    api.getStability(60).then(setStability);
    api.getStateHistory(24).then(setStateHistory);
    api.getSubsystemTrend(24).then(setSubTrend);
  }, [tab]);

  return (
    <div className="mon-root">
      <aside className="mon-rail">
        <TelemetryIngestion />
        <NetraAssistant />
        <RuleSet />
      </aside>
      <main className="mon-main">
        <nav className="mon-tabs">
          {TABS.map((t) => (
            <button key={t.id}
                    className={`mon-tab ${tab === t.id ? 'on' : ''}`}
                    onClick={() => setTab(t.id)}>
              {t.icon}<span>{t.label}</span>
            </button>
          ))}
          <div className="mon-tabs-spacer" />
          <span className="mon-tabs-meta mono">
            mode {snapshot?.mode || '—'} · risk {fmt(snapshot?.risk_score, 2)}
          </span>
        </nav>
        <div className="mon-view">
          {tab === 'live' ? (
            <LiveView snapshot={snapshot}
                      riskHistory={riskHistory}
                      anomalies={anomalies}
                      sankey={sankey}
                      alerts={alerts} />
          ) : (
            <AnalyticsView heatmap={heatmap}
                           anomalies={anomalies}
                           stability={stability}
                           stateHistory={stateHistory}
                           subTrend={subTrend} />
          )}
        </div>
      </main>
    </div>
  );
}
