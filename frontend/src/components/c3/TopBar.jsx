import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Plus, Satellite } from 'lucide-react';

/*
 * TopBar — thin fixed bar: wordmark, module nav, spacecraft selector,
 * UTC clock, link status. Calm by default; the link dot is the only
 * thing that carries colour, and only when the link is active.
 */

const MODULES = ['Control', 'Flight dynamics', 'Monitoring', 'Tasking'];

function UTCClock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="c3-clock">{t.toISOString().replace('T', ' ').slice(0, 19)} UTC</span>;
}

function SpacecraftSelector({ satellites, activeSatellite, onSwitch, onAdd }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const label = activeSatellite
    ? (activeSatellite.resolvedName || activeSatellite.name)
    : 'No satellite';

  return (
    <div className="c3-sc-select" ref={ref}>
      <button className="c3-sc-trigger" onClick={() => setOpen((o) => !o)}>
        <Satellite size={13} />
        <span>{label}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="c3-sc-menu">
          {satellites.length === 0 && (
            <div className="c3-sc-row" style={{ color: 'var(--c3-text-3)' }}>
              No satellites onboarded
            </div>
          )}
          {satellites.map((s) => (
            <div key={s.id}
                 className={`c3-sc-row ${s.id === activeSatellite?.id ? 'active' : ''}`}
                 onClick={() => { onSwitch(s.id); setOpen(false); }}>
              <Satellite size={12} />
              <span>{s.resolvedName || s.name}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--c3-text-3)', fontSize: 10 }}>
                {s.network}
              </span>
            </div>
          ))}
          <div className="c3-sc-row add" onClick={() => { onAdd(); setOpen(false); }}>
            <Plus size={12} />
            <span>Add satellite</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TopBar({
  satellites, activeSatellite, onSwitch, onAddSatellite,
  contactState, connected,
}) {
  const linkActive = connected && contactState?.inContact;
  const dotClass = !connected ? 'alarm'
    : contactState?.inContact ? 'live'
    : 'warn';
  const linkLabel = !connected ? 'Backend offline'
    : contactState?.inContact ? `Link active · ${contactState.station || ''}`
    : 'No contact';

  return (
    <div className="c3-topbar">
      <span className="c3-wordmark">DISHA</span>

      <nav className="c3-nav">
        {MODULES.map((m) => (
          <button key={m} className={`c3-nav-item ${m === 'Control' ? 'active' : ''}`}>
            {m}
          </button>
        ))}
      </nav>

      <SpacecraftSelector
        satellites={satellites}
        activeSatellite={activeSatellite}
        onSwitch={onSwitch}
        onAdd={onAddSatellite}
      />

      <div className="c3-topbar-spacer" />

      <UTCClock />
      <div className="c3-link">
        <span className={`c3-dot ${dotClass}`} />
        <span>{linkLabel}</span>
      </div>
    </div>
  );
}
