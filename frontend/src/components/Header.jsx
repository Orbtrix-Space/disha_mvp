import { useState, useEffect } from 'react';
import { Satellite, Map, Send, RotateCcw } from 'lucide-react';

function Clock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const utc = time.toISOString().replace('T', '  ').slice(0, 21) + ' UTC';

  return <div className="header-clock">{utc}</div>;
}

export default function Header({ view, setView, health, onReset }) {
  return (
    <header className="header">
      <div className="header-left">
        <div className="header-logo">
          <Satellite size={22} />
          <div>
            <div className="header-title">DISHA</div>
            <div className="header-subtitle">Mission Control</div>
          </div>
        </div>

        <nav className="header-nav" style={{ marginLeft: 24 }}>
          <button
            className={`nav-btn ${view === 'dashboard' ? 'active' : ''}`}
            onClick={() => setView('dashboard')}
          >
            <Map size={14} /> Dashboard
          </button>
          <button
            className={`nav-btn ${view === 'planner' ? 'active' : ''}`}
            onClick={() => setView('planner')}
          >
            <Send size={14} /> Mission Planner
          </button>
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
