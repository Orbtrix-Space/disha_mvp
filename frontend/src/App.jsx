import { useState, useCallback, useRef, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { api } from './services/api';
import Header from './components/Header';
import CesiumGlobe from './components/CesiumGlobe';
import GroundTrack2D from './components/GroundTrack2D';
import Telemetry from './components/Telemetry';
import ControlStrip from './components/ControlStrip';
import FDIRPanel from './components/FDIRPanel';
import SchedulePanel from './components/SchedulePanel';

const WS_URL = 'ws://127.0.0.1:8000/ws/telemetry';

/* ── Drag handle helper ── */
function DragHandle({ axis, onDrag, className }) {
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      onDrag(axis === 'x' ? dx : dy, ev);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [axis, onDrag]);

  return (
    <div
      className={`resize-handle resize-handle-${axis} ${className || ''}`}
      onMouseDown={handleMouseDown}
    />
  );
}

function App() {
  const [view, setView] = useState('control');
  const { telemetry, alerts, connected, clearAlerts } = useWebSocket(WS_URL);

  // Resizable panel sizes (pixels)
  const containerRef = useRef(null);
  const [globeW, setGlobeW] = useState(null);     // null = auto (use CSS default)
  const [sidebarW, setSidebarW] = useState(340);
  const [stripH, setStripH] = useState(210);

  // Refs to capture starting size on drag start
  const startRef = useRef({});

  const handleReset = useCallback(async () => {
    await api.resetSatellite();
    clearAlerts();
  }, [clearAlerts]);

  // Globe ↔ Map divider (vertical)
  const onDragGlobe = useCallback((dx) => {
    if (startRef.current.globeW == null) {
      // First drag: snapshot current rendered width
      const el = containerRef.current?.querySelector('.control-globe');
      if (el) startRef.current.globeW = el.offsetWidth;
    }
    const base = startRef.current.globeW;
    if (base) setGlobeW(Math.max(200, base + dx));
  }, []);

  // Map ↔ Sidebar divider (vertical)
  const onDragSidebar = useCallback((dx) => {
    if (startRef.current.sidebarW == null) {
      startRef.current.sidebarW = sidebarW;
    }
    const base = startRef.current.sidebarW;
    setSidebarW(Math.max(240, Math.min(600, base - dx)));
  }, [sidebarW]);

  // Top ↔ Strip divider (horizontal)
  const onDragStrip = useCallback((dy) => {
    if (startRef.current.stripH == null) {
      startRef.current.stripH = stripH;
    }
    const base = startRef.current.stripH;
    setStripH(Math.max(120, Math.min(400, base - dy)));
  }, [stripH]);

  // Reset start ref on mouseup (already handled in DragHandle, but let's be safe)
  useEffect(() => {
    const reset = () => { startRef.current = {}; };
    window.addEventListener('mouseup', reset);
    return () => window.removeEventListener('mouseup', reset);
  }, []);

  // Build dynamic grid style
  const controlStyle = {
    gridTemplateColumns: `${globeW ? globeW + 'px' : '1.4fr'} 6px 1fr 6px ${sidebarW}px`,
    gridTemplateRows: `1fr 6px ${stripH}px`,
    gridTemplateAreas: `
      "globe hg1 map hg2 sidebar"
      "hrow  hrow hrow hrow sidebar"
      "strip strip strip strip sidebar"
    `,
  };

  return (
    <div className="app-layout">
      <Header
        view={view}
        setView={setView}
        health={connected ? 'online' : 'offline'}
        onReset={handleReset}
        alertCount={alerts.filter((a) => a.severity === 'CRITICAL').length}
      />

      <div className="main-content">
        {view === 'control' && (
          <div
            className="dashboard-layout control-layout"
            ref={containerRef}
            style={controlStyle}
          >
            <div className="control-globe" style={{ gridArea: 'globe' }}>
              <CesiumGlobe telemetry={telemetry} />
            </div>

            <DragHandle axis="x" onDrag={onDragGlobe} className="hg1" />

            <div className="control-map" style={{ gridArea: 'map' }}>
              <GroundTrack2D telemetry={telemetry} />
            </div>

            <DragHandle axis="x" onDrag={onDragSidebar} className="hg2" />

            <div className="control-sidebar" style={{ gridArea: 'sidebar' }}>
              <Telemetry telemetry={telemetry} />
            </div>

            <DragHandle axis="y" onDrag={onDragStrip} className="hrow" />

            <div className="control-strip-area" style={{ gridArea: 'strip' }}>
              <ControlStrip alerts={alerts} />
            </div>
          </div>
        )}

        {view === 'fdir' && <FDIRPanel alerts={alerts} />}
        {view === 'schedule' && <SchedulePanel />}
      </div>
    </div>
  );
}

export default App;
