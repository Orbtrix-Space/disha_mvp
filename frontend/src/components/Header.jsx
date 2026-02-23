import { useState, useEffect } from 'react';
import { Satellite, Monitor, Send, ShieldAlert, RotateCcw } from 'lucide-react';

function Clock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const utc = time.toISOString().replace('T', '  ').slice(0, 21) + ' UTC';

  return <div className="header-clock">{utc}</div>;
}

const TABS = [
  { key: 'control', label: 'CONTROL', icon: Monitor },
  { key: 'fdir', label: 'FDIR', icon: ShieldAlert },
  { key: 'schedule', label: 'SCHEDULE', icon: Send },
];

export default function Header({ view, setView, health, onReset, alertCount = 0 }) {
  return (
    <header className="header">
      <div className="header-left">
        <div className="header-logo">
          <Satellite size={22} />
          <div>
            <div className="header-title">DISHA</div>
            <div className="header-subtitle">Satellite Operations</div>
          </div>
        </div>

        <nav className="header-nav" style={{ marginLeft: 24 }}>
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`nav-btn ${view === key ? 'active' : ''}`}
              onClick={() => setView(key)}
              style={key === 'fdir' ? { position: 'relative' } : undefined}
            >
              <Icon size={14} /> {label}
              {key === 'fdir' && alertCount > 0 && (
                <span className="alert-badge">{alertCount}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <div className="header-right">
        <Clock />
        <button
          className="nav-btn"
          onClick={onReset}
          title="Reset Satellite State"
        >
          <RotateCcw size={14} />
        </button>
        <div className={`status-badge ${health}`}>
          <span className={`status-dot ${health}`} />
          {health === 'online' ? 'LINK ACTIVE' : 'NO SIGNAL'}
        </div>
      </div>
    </header>
  );
}
