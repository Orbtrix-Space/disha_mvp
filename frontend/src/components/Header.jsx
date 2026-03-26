import { useState, useEffect, useMemo, useCallback } from 'react';
import { Satellite, Monitor, Send, ShieldAlert, RotateCcw, Globe, Battery, Thermometer, Radio, Crosshair, Camera, Sun, Moon } from 'lucide-react';
import html2canvas from 'html2canvas';
import { useTheme } from '../hooks/useTheme';

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
  { key: 'flight', label: 'FLIGHT', icon: Globe },
  { key: 'fdir', label: 'MONITOR', icon: ShieldAlert },
  { key: 'schedule', label: 'SCHEDULE', icon: Send },
];

function SatHealthStrip({ telemetry }) {
  const checks = useMemo(() => {
    if (!telemetry) return null;
    return [
      { key: 'PWR', icon: Battery, ok: telemetry.battery_pct > 20 },
      { key: 'THM', icon: Thermometer, ok: telemetry.panel_temp_c > -40 && telemetry.panel_temp_c < 85 },
      { key: 'COM', icon: Radio, ok: telemetry.link_status === 'NOMINAL' },
      { key: 'ADS', icon: Crosshair, ok: telemetry.pointing_error < 2.0 },
    ];
  }, [telemetry]);

  if (!checks) return null;

  const allOk = checks.every(c => c.ok);

  return (
    <div className={`sat-health-strip ${allOk ? 'nominal' : 'degraded'}`}>
      {checks.map(({ key, icon: Icon, ok }) => (
        <span key={key} className={`sat-health-chip ${ok ? 'ok' : 'warn'}`} title={key}>
          <Icon size={9} /> {key}
        </span>
      ))}
    </div>
  );
}

export default function Header({ view, setView, health, onReset, alertCount = 0, telemetry }) {
  const [snapping, setSnapping] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const handleSnapshot = useCallback(async () => {
    setSnapping(true);
    try {
      const root = document.getElementById('root');
      const canvas = await html2canvas(root, {
        backgroundColor: theme === 'dark' ? '#000000' : '#f5f5f5',
        scale: 2,
        useCORS: true,
        logging: false,
        ignoreElements: (el) => el.classList?.contains('cesium-widget-credits'),
      });
      const link = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.download = `DISHA_${view.toUpperCase()}_${ts}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Snapshot failed:', err);
    } finally {
      setSnapping(false);
    }
  }, [view]);

  return (
    <header className="header">
      <div className="header-left">
        <div className="header-logo">
          <div className="header-title">DISHA</div>
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
          className="theme-toggle"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button
          className="nav-btn"
          onClick={handleSnapshot}
          title="Capture Dashboard Snapshot"
          disabled={snapping}
        >
          <Camera size={14} />
        </button>
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
        <img
          src="/company-logo.png"
          alt="Company Logo"
          className="header-company-logo"
        />
      </div>
    </header>
  );
}
