import { useState, useCallback, useEffect } from 'react';
import {
  ChevronLeft, ChevronRight, ChevronDown, Satellite, Layers, Plus, Check,
  Wrench, Upload as UploadIcon, Database, X as XIcon,
} from 'lucide-react';
import { api } from '../services/api';

/*
 * DashboardSidebar — left rail used by every page.
 *
 * Three sections (Control page uses all three; other pages skip ops):
 *   1. Satellite onboarding — three modes (NORAD / paste TLE / manual
 *      orbital elements) + name + ground network.
 *   2. Panels — toggle which windows render in the main area.
 *   3. Operations — clickable Insert items that open as modals.
 *
 * The sidebar is purely additive: hiding it or hiding every panel has
 * no effect on backend state or routing.
 */

const COLLAPSED_KEY = 'disha.dashboard.sidebar.collapsed';

const NETWORKS = ['ISRO', 'NASA', 'ESA', 'KSAT', 'Global'];

const QUICK_TARGETS = [
  { id: 25544, label: 'ISS' },
  { id: 49260, label: 'Landsat 9' },
];

const DEFAULT_OPERATIONS = [
  { kind: 'telecommand_format', label: 'Build telecommand' },
  { kind: 'packets',            label: 'Packet definitions' },
];

export default function DashboardSidebar({
  visible, toggle, setAll, panelLabels = {},
  operations = DEFAULT_OPERATIONS, showOperations = true,
  onOpenOperation,
  flightMode = false,
}) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0'); } catch {}
  }, [collapsed]);

  if (collapsed) {
    return (
      <div className="ds-rail ds-rail-collapsed">
        <button className="ds-collapse-btn" onClick={() => setCollapsed(false)}
                title="Expand">
          <ChevronRight size={14} />
        </button>
      </div>
    );
  }

  // Flight page: stripped-down sidebar with only GPS + Tracking Data.
  // Panels are no longer user-toggleable on Flight; layout is fixed.
  if (flightMode) {
    return (
      <aside className="ds-rail">
        <div className="ds-rail-head">
          <span className="ds-rail-title">Workspace</span>
          <button className="ds-collapse-btn" onClick={() => setCollapsed(true)} title="Collapse">
            <ChevronLeft size={14} />
          </button>
        </div>
        <GpsSection />
        <TrackingDataSection />
      </aside>
    );
  }

  return (
    <aside className="ds-rail">
      <div className="ds-rail-head">
        <span className="ds-rail-title">Workspace</span>
        <button className="ds-collapse-btn" onClick={() => setCollapsed(true)} title="Collapse">
          <ChevronLeft size={14} />
        </button>
      </div>

      <OnboardingSection />

      <PanelsSection
        visible={visible}
        toggle={toggle}
        setAll={setAll}
        panelLabels={panelLabels}
      />

      {showOperations && (
        <OperationsSection
          operations={operations}
          onOpen={onOpenOperation}
        />
      )}
    </aside>
  );
}

/* ── Section 1: Satellite onboarding ─────────────────────────── */

function OnboardingSection() {
  const [mode, setMode] = useState('norad');
  const [name, setName] = useState('');
  const [network, setNetwork] = useState('ISRO');
  const [noradId, setNoradId] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [el, setEl] = useState({
    inclination_deg: '', raan_deg: '', eccentricity: '',
    arg_perigee_deg: '', mean_anomaly_deg: '', mean_motion_rev_day: '',
  });
  // GPS-mode state
  const [gpsCsv, setGpsCsv] = useState('');
  const [gpsSigma, setGpsSigma] = useState('5');
  const [gpsFrame, setGpsFrame] = useState('ECI');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  const setElField = (k) => (e) => setEl((p) => ({ ...p, [k]: e.target.value }));

  const valid = (
    (mode === 'norad' && noradId.trim()) ||
    (mode === 'tle' && line1.trim() && line2.trim()) ||
    (mode === 'elements' && Object.values(el).every((v) => v !== '')) ||
    (mode === 'gps' && gpsCsv.trim().length > 0)
  );

  const submit = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    let res = null;
    try {
      if (mode === 'norad') {
        const id = parseInt(noradId, 10);
        if (!Number.isFinite(id)) {
          setStatus({ kind: 'error', text: 'Enter a numeric NORAD id.' });
          setBusy(false);
          return;
        }
        res = await api.loadTLE(id);
      } else if (mode === 'tle') {
        res = await api.loadTLERaw(name || null, line1.trim(), line2.trim());
      } else if (mode === 'elements') {
        const elements = Object.fromEntries(
          Object.entries(el).map(([k, v]) => [k, parseFloat(v)])
        );
        res = await api.loadTLEElements(name || null, elements);
      } else if (mode === 'gps') {
        // GPS path: ingest the arc, then trigger the pipeline. The
        // pipeline does the OD + screen + assess + recommend.
        const ing = await api.ingestGPSCsv(gpsCsv, parseFloat(gpsSigma) || 5.0, gpsFrame, 'paste');
        if (!ing?.ok) {
          setStatus({ kind: 'error', text: ing?.message || 'GPS ingest failed.' });
          setBusy(false);
          return;
        }
        const run = await api.runFlightPipeline(24, 30);
        if (run?.run?.state === 'complete') {
          const od = run.run.od_result;
          setStatus({
            kind: 'ok',
            text: od ? `OD: ${od.iterations} iter, RMS ${od.rms_residual_m} m, σ_pos ${od.sigma_pos_m} m` : 'Pipeline complete.',
          });
        } else {
          setStatus({ kind: 'error', text: run?.run?.error || 'Pipeline failed.' });
        }
        setBusy(false);
        return;
      }
    } catch (e) {
      res = { status: 'ERROR', message: e.message };
    }
    setBusy(false);
    if (res?.status === 'SUCCESS') {
      setStatus({
        kind: 'ok',
        text: `Online: ${res.tle?.satellite_name || name || 'satellite'}`,
      });
    } else {
      setStatus({ kind: 'error', text: res?.message || 'Could not bring it online.' });
    }
  }, [mode, name, noradId, line1, line2, el, gpsCsv, gpsSigma, gpsFrame]);

  return (
    <section className="ds-section">
      <div className="ds-section-head">
        <Satellite size={11} />
        <span>Satellite onboarding</span>
      </div>

      <div className="ds-mode-toggle">
        <button className={mode === 'norad' ? 'on' : ''} onClick={() => setMode('norad')}>NORAD</button>
        <button className={mode === 'tle' ? 'on' : ''} onClick={() => setMode('tle')}>TLE</button>
        <button className={mode === 'elements' ? 'on' : ''} onClick={() => setMode('elements')}>Elements</button>
        <button className={mode === 'gps' ? 'on' : ''} onClick={() => setMode('gps')}>GPS</button>
      </div>

      {mode === 'norad' && (
        <>
          <label className="ds-label">NORAD catalog id</label>
          <input className="ds-input" value={noradId} placeholder="25544"
                 onChange={(e) => setNoradId(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
          <div className="ds-quick">
            {QUICK_TARGETS.map((q) => (
              <button key={q.id} className="ds-quick-btn"
                      onClick={() => setNoradId(String(q.id))}>{q.label}</button>
            ))}
          </div>
        </>
      )}

      {mode === 'tle' && (
        <>
          <label className="ds-label">TLE line 1</label>
          <textarea className="ds-input ds-textarea" rows={2} value={line1}
                    placeholder="1 25544U ..." onChange={(e) => setLine1(e.target.value)} />
          <label className="ds-label">TLE line 2</label>
          <textarea className="ds-input ds-textarea" rows={2} value={line2}
                    placeholder="2 25544 ..." onChange={(e) => setLine2(e.target.value)} />
        </>
      )}

      {mode === 'elements' && (
        <>
          <div className="ds-row2">
            <div><label className="ds-label">Inclination °</label>
              <input className="ds-input" value={el.inclination_deg} onChange={setElField('inclination_deg')} /></div>
            <div><label className="ds-label">RAAN °</label>
              <input className="ds-input" value={el.raan_deg} onChange={setElField('raan_deg')} /></div>
          </div>
          <div className="ds-row2">
            <div><label className="ds-label">Eccentricity</label>
              <input className="ds-input" value={el.eccentricity} onChange={setElField('eccentricity')} /></div>
            <div><label className="ds-label">Arg perigee °</label>
              <input className="ds-input" value={el.arg_perigee_deg} onChange={setElField('arg_perigee_deg')} /></div>
          </div>
          <div className="ds-row2">
            <div><label className="ds-label">Mean anom °</label>
              <input className="ds-input" value={el.mean_anomaly_deg} onChange={setElField('mean_anomaly_deg')} /></div>
            <div><label className="ds-label">Mean motion rev/d</label>
              <input className="ds-input" value={el.mean_motion_rev_day} onChange={setElField('mean_motion_rev_day')} /></div>
          </div>
        </>
      )}

      {mode === 'gps' && (
        <>
          <label className="ds-label">GPS arc CSV (epoch, x, y, z [, vx, vy, vz])</label>
          <textarea className="ds-input ds-textarea" rows={4} value={gpsCsv}
                    placeholder="epoch,x,y,z,vx,vy,vz&#10;2026-05-27T12:00:00Z,6928.137,0,0,0,4.694,5.952"
                    onChange={(e) => setGpsCsv(e.target.value)} />
          <div className="ds-row2">
            <div>
              <label className="ds-label">σ position (m)</label>
              <input className="ds-input" value={gpsSigma}
                     onChange={(e) => setGpsSigma(e.target.value)} />
            </div>
            <div>
              <label className="ds-label">Frame</label>
              <select className="ds-input ds-select" value={gpsFrame}
                      onChange={(e) => setGpsFrame(e.target.value)}>
                <option value="ECI">ECI</option>
                <option value="ECEF">ECEF (future)</option>
              </select>
            </div>
          </div>
        </>
      )}

      <div className="ds-row2">
        <div>
          <label className="ds-label">Name (optional)</label>
          <input className="ds-input" value={name} placeholder="Auto"
                 onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="ds-label">Ground network</label>
          <select className="ds-input ds-select" value={network}
                  onChange={(e) => setNetwork(e.target.value)}>
            {NETWORKS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      <button className="ds-primary" disabled={!valid || busy} onClick={submit}>
        {busy
          ? (mode === 'gps' ? 'Determining orbit…' : 'Bringing online…')
          : (mode === 'gps' ? 'Determine orbit' : 'Bring online')}
      </button>
      {status && (
        <div className={`ds-status ds-status-${status.kind}`}>{status.text}</div>
      )}
    </section>
  );
}

/* ── Section 2: Panels ───────────────────────────────────────── */

function PanelsSection({ visible, toggle, setAll, panelLabels }) {
  return (
    <section className="ds-section">
      <div className="ds-section-head">
        <Layers size={11} />
        <span>Panels</span>
        <div className="ds-section-actions">
          <button className="ds-mini-btn" onClick={() => setAll(true)}>All</button>
          <button className="ds-mini-btn" onClick={() => setAll(false)}>None</button>
        </div>
      </div>
      <ul className="ds-toggles">
        {Object.entries(panelLabels).map(([key, label]) => (
          <li key={key}>
            <button className={`ds-toggle ${visible[key] ? 'on' : ''}`}
                    onClick={() => toggle(key)}>
              <span className="ds-tick">{visible[key] ? <Check size={11} /> : null}</span>
              <span className="ds-toggle-label">{label}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Flight-mode accordion shell ─────────────────────────────── */

const ACC_KEY = (id) => `disha.flight.sidebar.${id}.expanded`;

function Accordion({ id, icon, title, chip, children, defaultExpanded = true }) {
  const [expanded, setExpanded] = useState(() => {
    try {
      const v = localStorage.getItem(ACC_KEY(id));
      return v == null ? defaultExpanded : v === '1';
    } catch { return defaultExpanded; }
  });
  useEffect(() => {
    try { localStorage.setItem(ACC_KEY(id), expanded ? '1' : '0'); } catch {}
  }, [id, expanded]);

  return (
    <section className={`ds-acc ${expanded ? 'open' : 'closed'}`}>
      <button className="ds-acc-head" onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}>
        <ChevronDown size={11} className="ds-acc-chev" />
        {icon}
        <span className="ds-acc-title">{title}</span>
        {chip}
      </button>
      {expanded && <div className="ds-acc-body">{children}</div>}
    </section>
  );
}

function Chip({ kind, dot = false, children }) {
  return (
    <span className={`ds-chip ds-chip-${kind}`}>
      {dot && <span className="ds-chip-dot" />}
      {children}
    </span>
  );
}

/* ── Flight-mode Section 1: GPS (orbit source) ───────────────── */

const EPOCH_FORMATS = [
  { value: 'iso', label: 'UTC ISO-8601' },
  { value: 'gps_week', label: 'GPS week + sec (future)' },
];

function GpsSection() {
  const [csv, setCsv] = useState('');
  const [sigma, setSigma] = useState('5');
  const [frame, setFrame] = useState('ECEF');
  const [epochFmt, setEpochFmt] = useState('iso');
  const [fitArc, setFitArc] = useState('full');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [pipelineMeta, setPipelineMeta] = useState({ fixes: 0, odOk: false });
  const valid = csv.trim().length > 0;

  // Poll pipeline status for chip ("N fixes" / OD success)
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      const r = await api.getFlightPipeline();
      if (!mounted) return;
      setPipelineMeta({
        fixes: r?.gps_meta?.count || 0,
        odOk: r?.run?.od_result?.converged === true,
      });
    };
    poll();
    const id = setInterval(poll, 4000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const handleFile = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result || ''));
    reader.readAsText(file);
  }, []);

  const submit = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    const ing = await api.ingestGPSCsv(csv, parseFloat(sigma) || 5.0, frame, 'paste');
    if (!ing?.ok) {
      setStatus({ kind: 'error', text: ing?.message || 'GPS ingest failed.' });
      setBusy(false);
      return;
    }
    const run = await api.runFlightPipeline(24, 30);
    if (run?.run?.state === 'complete') {
      const od = run.run.od_result;
      setStatus({
        kind: 'ok',
        text: od
          ? `OD: ${od.iterations} iter, RMS ${od.rms_residual_m} m, σ ${od.sigma_pos_m} m`
          : 'Pipeline complete.',
      });
    } else {
      setStatus({ kind: 'error', text: run?.run?.error || 'Pipeline failed.' });
    }
    setBusy(false);
  }, [csv, sigma, frame]);

  // Chip resolution: green-dot when OD succeeded; neutral count when fixes
  // are loaded but pipeline hasn't run; muted "no data" when empty.
  const chip = pipelineMeta.fixes > 0
    ? <Chip kind={pipelineMeta.odOk ? 'ok' : 'info'} dot={pipelineMeta.odOk}>
        {pipelineMeta.fixes} fix{pipelineMeta.fixes === 1 ? '' : 'es'}
      </Chip>
    : <Chip kind="muted">no data</Chip>;

  return (
    <Accordion id="gps" icon={<Satellite size={11} />}
               title="GPS (orbit source)" chip={chip}>
      <label className="ds-label">GPS arc — paste CSV / SP3</label>
      <textarea className="ds-input ds-textarea ds-textarea-bounded"
                rows={6} value={csv}
                placeholder={'epoch,x_km,y_km,z_km[,vx,vy,vz]\n2026-05-28T12:00:00Z,7006.0,0.0,0.0,...'}
                onChange={(e) => setCsv(e.target.value)} />

      <div className="ds-file-row">
        <label className="ds-secondary">
          <UploadIcon size={11} />
          <span>Upload file</span>
          <input type="file" accept=".csv,.sp3,.txt"
                 onChange={(e) => handleFile(e.target.files?.[0])} hidden />
        </label>
        {csv.length > 0 && (
          <button className="ds-icon-btn" onClick={() => setCsv('')} title="Clear">
            <XIcon size={11} />
          </button>
        )}
      </div>

      <div className="ds-row2">
        <div>
          <label className="ds-label">Frame</label>
          <select className="ds-input ds-select" value={frame}
                  onChange={(e) => setFrame(e.target.value)}>
            <option value="ECEF">ECEF</option>
            <option value="ECI">ECI</option>
          </select>
        </div>
        <div>
          <label className="ds-label">Epoch format</label>
          <select className="ds-input ds-select" value={epochFmt}
                  onChange={(e) => setEpochFmt(e.target.value)}>
            {EPOCH_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="ds-row2">
        <div>
          <label className="ds-label">σ position (m)</label>
          <input className="ds-input" value={sigma}
                 onChange={(e) => setSigma(e.target.value)} />
        </div>
        <div>
          <label className="ds-label">Fit arc</label>
          <select className="ds-input ds-select" value={fitArc}
                  onChange={(e) => setFitArc(e.target.value)}>
            <option value="full">Full arc</option>
            <option value="head">First half</option>
            <option value="tail">Last half</option>
          </select>
        </div>
      </div>

      <button className="ds-primary ds-primary-emph"
              disabled={!valid || busy} onClick={submit}>
        {busy ? 'Determining orbit…' : 'Determine orbit'}
      </button>
      {status && (
        <div className={`ds-status ds-status-${status.kind}`}>{status.text}</div>
      )}
    </Accordion>
  );
}

/* ── Flight-mode Section 2: Tracking Data (screen against) ──── */

const CATALOG_SOURCES = ['Loaded catalog', 'ISRO', 'NASA', 'ESA', 'KSAT', 'GLOBAL'];

function TrackingDataSection() {
  const [source, setSource] = useState('Loaded catalog');
  const [tleText, setTleText] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [catalog, setCatalog] = useState({ count: 0, names: [], source: 'none' });
  // dirty: textarea contains content that hasn't been loaded yet
  const [dirty, setDirty] = useState(false);

  const refresh = useCallback(async () => {
    const r = await api.getFlightCatalog();
    if (r?.catalog) setCatalog(r.catalog);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  // Re-check periodically so the chip stays accurate if state changes elsewhere
  useEffect(() => {
    const id = setInterval(refresh, 6000);
    return () => clearInterval(id);
  }, [refresh]);

  const handleFile = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setTleText(String(reader.result || ''));
      setDirty(true);
    };
    reader.readAsText(file);
  }, []);

  const onTleChange = useCallback((e) => {
    setTleText(e.target.value);
    setDirty(e.target.value.trim().length > 0);
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    const r = await api.uploadFlightCatalog(tleText, source);
    if (r?.ok) {
      setStatus({ kind: 'ok', text: `${r.catalog.count} objects loaded.` });
      setCatalog(r.catalog);
      setDirty(false);
    } else {
      setStatus({ kind: 'error', text: r?.message || 'Catalog upload failed.' });
    }
    setBusy(false);
  }, [tleText, source]);

  const clear = useCallback(async () => {
    await api.clearFlightCatalog();
    setCatalog({ count: 0, names: [], source: 'none' });
    setTleText('');
    setStatus(null);
    setDirty(false);
  }, []);

  // Chip resolution:
  //   loaded count > 0           → green dot, "N objects"
  //   text pasted but not loaded → amber, "pasted — not loaded"
  //   nothing                    → muted, "0 objects"
  let chip;
  if (catalog.count > 0) {
    chip = <Chip kind="ok" dot>
      {catalog.count} object{catalog.count === 1 ? '' : 's'}
    </Chip>;
  } else if (dirty) {
    chip = <Chip kind="warn">pasted — not loaded</Chip>;
  } else {
    chip = <Chip kind="muted">0 objects</Chip>;
  }

  return (
    <Accordion id="tracking" icon={<Database size={11} />}
               title="Tracking data" chip={chip}>
      <label className="ds-label">Catalog source</label>
      <select className="ds-input ds-select" value={source}
              onChange={(e) => setSource(e.target.value)}>
        {CATALOG_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      <label className="ds-label">Paste TLE catalog (3-line sets)</label>
      <textarea className="ds-input ds-textarea ds-textarea-bounded"
                rows={5} value={tleText}
                placeholder={'ISS (ZARYA)\n1 25544U ...\n2 25544 ...\nLANDSAT 9\n1 49260U ...'}
                onChange={onTleChange} />

      <div className="ds-file-row">
        <label className="ds-secondary">
          <UploadIcon size={11} />
          <span>Upload TLE file</span>
          <input type="file" accept=".tle,.txt"
                 onChange={(e) => handleFile(e.target.files?.[0])} hidden />
        </label>
        <button className="ds-secondary"
                disabled={!tleText.trim() || busy || !dirty}
                onClick={load}>
          {busy ? 'Loading…' : 'Load'}
        </button>
      </div>

      {status && (
        <div className={`ds-status ds-status-${status.kind}`}>{status.text}</div>
      )}

      <div className="ds-cat-summary">
        <div className="ds-cat-head">
          <span className="ds-cat-count">
            {catalog.count} object{catalog.count === 1 ? '' : 's'} loaded
          </span>
          {catalog.count > 0 && (
            <button className="ds-icon-btn" onClick={clear} title="Clear catalog">
              <XIcon size={11} />
            </button>
          )}
        </div>
        {catalog.count > 0 ? (
          <ul className="ds-cat-list">
            {(catalog.names || []).slice(0, 12).map((n, i) => (
              <li key={i} className="ds-cat-item mono">{n}</li>
            ))}
            {catalog.count > 12 && (
              <li className="ds-cat-more">+{catalog.count - 12} more</li>
            )}
          </ul>
        ) : (
          <div className="ds-cat-empty">
            {dirty
              ? 'Press Load to ingest the pasted catalog.'
              : 'Screening will use synthetic threats.'}
          </div>
        )}
      </div>
    </Accordion>
  );
}

/* ── Section 3: Operations / Insert ──────────────────────────── */

function OperationsSection({ operations, onOpen }) {
  return (
    <section className="ds-section">
      <div className="ds-section-head">
        <Wrench size={11} />
        <span>Operations</span>
      </div>
      <ul className="ds-toggles">
        {operations.map((op) => (
          <li key={op.kind}>
            <button className="ds-op-item" onClick={() => onOpen && onOpen(op)}>
              <span className="ds-op-icon">
                {op.icon || <UploadIcon size={11} />}
              </span>
              <span className="ds-toggle-label">{op.label}</span>
              <Plus size={11} className="ds-op-plus" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

