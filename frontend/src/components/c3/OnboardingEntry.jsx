import { useState, useCallback } from 'react';

/*
 * OnboardingEntry — one compact entry to bring a satellite online fast.
 * No multi-step wizard. Three input modes share a single name field,
 * an optional ground network, and one action button.
 *
 * Used both as the centered empty-state card and as the popover from
 * the spacecraft selector's plus control.
 */

const NETWORKS = ['ISRO', 'NASA', 'ESA', 'KSAT', 'Global'];

const QUICK_NORAD = [
  { id: 25544, label: 'ISS (25544)' },
  { id: 49260, label: 'Landsat 9 (49260)' },
];

export default function OnboardingEntry({ onSubmit, onCancel, compact }) {
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const valid = (
    (mode === 'norad' && noradId.trim()) ||
    (mode === 'tle' && line1.trim() && line2.trim()) ||
    (mode === 'elements' && Object.values(el).every((v) => v !== ''))
  );

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    let spec;
    if (mode === 'norad') {
      spec = { mode: 'norad', name: name || `NORAD ${noradId}`, network, noradId: noradId.trim() };
    } else if (mode === 'tle') {
      spec = { mode: 'tle', name: name || 'Pasted satellite', network, line1: line1.trim(), line2: line2.trim() };
    } else {
      spec = {
        mode: 'elements',
        name: name || 'Manual satellite',
        network,
        elements: Object.fromEntries(
          Object.entries(el).map(([k, v]) => [k, parseFloat(v)])
        ),
      };
    }
    const res = await onSubmit(spec);
    setBusy(false);
    if (!res?.ok) setError(res?.error || 'Could not bring the satellite online.');
  }, [mode, name, network, noradId, line1, line2, el, onSubmit]);

  const setElField = (k) => (e) => setEl((p) => ({ ...p, [k]: e.target.value }));

  return (
    <div className="c3-onboard">
      <h2>Bring a satellite online</h2>
      <p className="sub">Fetch by catalog id, paste a TLE, or enter orbital elements.</p>

      <div className="c3-modetoggle">
        <button className={mode === 'norad' ? 'active' : ''} onClick={() => setMode('norad')}>
          NORAD id
        </button>
        <button className={mode === 'tle' ? 'active' : ''} onClick={() => setMode('tle')}>
          Paste TLE
        </button>
        <button className={mode === 'elements' ? 'active' : ''} onClick={() => setMode('elements')}>
          Elements
        </button>
      </div>

      {mode === 'norad' && (
        <div className="c3-field">
          <label>NORAD catalog id</label>
          <input className="c3-input" value={noradId} placeholder="25544"
                 onChange={(e) => setNoradId(e.target.value)} />
          <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
            {QUICK_NORAD.map((q) => (
              <button key={q.id} className="c3-btn c3-btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }}
                      onClick={() => setNoradId(String(q.id))}>
                {q.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'tle' && (
        <>
          <div className="c3-field">
            <label>TLE line 1</label>
            <textarea className="c3-textarea" rows={2} value={line1}
                      placeholder="1 25544U ..." onChange={(e) => setLine1(e.target.value)} />
          </div>
          <div className="c3-field">
            <label>TLE line 2</label>
            <textarea className="c3-textarea" rows={2} value={line2}
                      placeholder="2 25544 ..." onChange={(e) => setLine2(e.target.value)} />
          </div>
        </>
      )}

      {mode === 'elements' && (
        <>
          <div className="c3-row3">
            <div className="c3-field">
              <label>Inclination °</label>
              <input className="c3-input" value={el.inclination_deg} onChange={setElField('inclination_deg')} />
            </div>
            <div className="c3-field">
              <label>RAAN °</label>
              <input className="c3-input" value={el.raan_deg} onChange={setElField('raan_deg')} />
            </div>
            <div className="c3-field">
              <label>Eccentricity</label>
              <input className="c3-input" value={el.eccentricity} onChange={setElField('eccentricity')} />
            </div>
          </div>
          <div className="c3-row3">
            <div className="c3-field">
              <label>Arg perigee °</label>
              <input className="c3-input" value={el.arg_perigee_deg} onChange={setElField('arg_perigee_deg')} />
            </div>
            <div className="c3-field">
              <label>Mean anomaly °</label>
              <input className="c3-input" value={el.mean_anomaly_deg} onChange={setElField('mean_anomaly_deg')} />
            </div>
            <div className="c3-field">
              <label>Mean motion rev/d</label>
              <input className="c3-input" value={el.mean_motion_rev_day} onChange={setElField('mean_motion_rev_day')} />
            </div>
          </div>
        </>
      )}

      <div className="c3-row2">
        <div className="c3-field">
          <label>Name (optional)</label>
          <input className="c3-input" value={name} placeholder="Auto"
                 onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="c3-field">
          <label>Ground network</label>
          <select className="c3-select" value={network} onChange={(e) => setNetwork(e.target.value)}>
            {NETWORKS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="c3-btn" disabled={!valid || busy} onClick={submit}>
          {busy ? 'Bringing online…' : 'Bring online'}
        </button>
        {onCancel && (
          <button className="c3-btn c3-btn-ghost" onClick={onCancel}>Cancel</button>
        )}
      </div>
      {error && <div className="c3-msg-error">{error}</div>}
    </div>
  );
}
