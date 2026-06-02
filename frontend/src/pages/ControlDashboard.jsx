import { useState, useCallback, useRef, useEffect } from 'react';
import { History, Play, FileText, Terminal } from 'lucide-react';
import CesiumGlobe from '../components/CesiumGlobe';
import GroundTrack2D from '../components/GroundTrack2D';
import TelemetrySidebar from '../components/Telemetry';
import AutonomyPanel from '../components/AutonomyPanel';
import PopupPanel from '../components/PopupPanel';
import { EventLog, CommandTerminal, PassCountdown } from '../components/ControlStrip';
import DashboardSidebar from '../components/DashboardSidebar';
import { useDashboardVisibility } from '../hooks/useDashboardVisibility';
import UploadModal from '../components/UploadModal';
import TelecommandModal from '../components/tc/TelecommandModal';
import PacketDefinitionsModal from '../components/tc/PacketDefinitionsModal';

function TelemetryPlayback({ history, onSelectFrame }) {
  const [scrubIndex, setScrubIndex] = useState(null);
  const isPlayback = scrubIndex !== null;
  const frameCount = history.length;
  if (frameCount < 20) return null;

  const handleScrub = (e) => {
    const idx = parseInt(e.target.value, 10);
    setScrubIndex(idx);
    if (onSelectFrame) onSelectFrame(history[idx]);
  };
  const exitPlayback = () => { setScrubIndex(null); if (onSelectFrame) onSelectFrame(null); };
  const elapsed = frameCount;
  const formatElapsed = (s) => s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;

  return (
    <div className="telem-playback">
      <div className="telem-playback-header">
        <History size={10} />
        <span>HISTORY</span>
        <span className="telem-playback-count">{formatElapsed(elapsed)}</span>
        {isPlayback && (
          <button className="telem-playback-exit" onClick={exitPlayback}>
            <Play size={9} /> LIVE
          </button>
        )}
      </div>
      <input type="range" className="telem-playback-slider"
        min={0} max={frameCount - 1} value={scrubIndex ?? frameCount - 1} onChange={handleScrub} />
      {isPlayback && (
        <div className="telem-playback-info">
          Frame {scrubIndex + 1}/{frameCount} | T-{formatElapsed(frameCount - 1 - scrubIndex)}
        </div>
      )}
    </div>
  );
}

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

  return <div className={`resize-handle resize-handle-${axis} ${className || ''}`} onMouseDown={handleMouseDown} />;
}

/* Tabbed bottom panel: Event Log | Command Terminal */
function TabbedBottomPanel({ alerts, contactState, bufferDump, clearBufferDump }) {
  const [tab, setTab] = useState('log');
  return (
    <div className="ctrl-tabbed">
      <div className="ctrl-tab-bar">
        <button className={`ctrl-tab-btn ${tab === 'log' ? 'active' : ''}`} onClick={() => setTab('log')}>
          <FileText size={11} /> EVENT LOG
        </button>
        <button className={`ctrl-tab-btn ${tab === 'terminal' ? 'active' : ''}`} onClick={() => setTab('terminal')}>
          <Terminal size={11} /> TERMINAL
        </button>
      </div>
      <div className="ctrl-tab-content">
        {tab === 'log' ? (
          <EventLog alerts={alerts} contactState={contactState} bufferDump={bufferDump} clearBufferDump={clearBufferDump} />
        ) : (
          <CommandTerminal />
        )}
      </div>
    </div>
  );
}

export default function ControlDashboard({ telemetry, alerts, contactState, bufferDump, clearBufferDump, telemetryHistory }) {
  const containerRef = useRef(null);
  const [globeW, setGlobeW] = useState(null);
  const [sidebarW, setSidebarW] = useState(null);
  const [stripH, setStripH] = useState(null);
  const [groundNetworkVersion] = useState(0);
  const [playbackFrame, setPlaybackFrame] = useState(null);
  const startRef = useRef({});
  const { visible, toggle, setAll, panelLabels } = useDashboardVisibility('control');
  const [openOperation, setOpenOperation] = useState(null);

  // True when either viz panel is on — keep the left grid cell rendered.
  const showGlobeArea = visible.globe3d || visible.groundtrack2d;

  const displayTelemetry = playbackFrame || telemetry;

  const onDragGlobe = useCallback((dx) => {
    if (startRef.current.globeW == null) {
      const el = containerRef.current?.querySelector('.control-globe-area');
      if (el) startRef.current.globeW = el.offsetWidth;
    }
    const base = startRef.current.globeW;
    if (base) setGlobeW(Math.max(200, base + dx));
  }, []);

  const onDragSidebar = useCallback((dx) => {
    if (startRef.current.sidebarW == null) {
      const el = containerRef.current?.querySelector('.control-sidebar');
      if (el) startRef.current.sidebarW = el.offsetWidth;
    }
    const base = startRef.current.sidebarW;
    if (base) setSidebarW(Math.max(220, Math.min(500, base - dx)));
  }, []);

  const onDragStrip = useCallback((dy) => {
    if (startRef.current.stripH == null) {
      const el = containerRef.current?.querySelector('.control-strip-area');
      if (el) startRef.current.stripH = el.offsetHeight;
    }
    const base = startRef.current.stripH;
    if (base) setStripH(Math.max(80, Math.min(400, base - dy)));
  }, []);

  useEffect(() => {
    const reset = () => { startRef.current = {}; };
    window.addEventListener('mouseup', reset);
    return () => window.removeEventListener('mouseup', reset);
  }, []);

  // Override CSS defaults only when user has dragged
  const controlStyle = {};
  if (globeW || sidebarW) {
    const col1 = globeW ? `${globeW}px` : '39fr';
    const col3 = sidebarW ? `${sidebarW}px` : '26fr';
    controlStyle.gridTemplateColumns = `${col1} 6px 1fr 6px ${col3}`;
    controlStyle.gridTemplateAreas = `
      "globe hg1 center hg2 sidebar"
      "hrow  hrow hrow  hrow hrow"
      "strip strip strip strip strip"
    `;
  }
  if (stripH) {
    controlStyle.gridTemplateRows = `1fr 6px ${stripH}px`;
  }

  return (
    <div className="ctrl-with-rail">
      <DashboardSidebar
        visible={visible}
        toggle={toggle}
        setAll={setAll}
        panelLabels={panelLabels}
        showOperations={true}
        onOpenOperation={(op) => setOpenOperation(op)}
      />
      <div className="dashboard-layout control-layout" ref={containerRef} style={controlStyle}>
        {/* Left — Globe + Map stacked (each gated independently) */}
        {showGlobeArea && (
          <div className="control-globe-area" style={{ gridArea: 'globe' }}>
            {visible.globe3d && (
              <div className="control-globe-inner pp-host">
                <PopupPanel title="3D GLOBE">
                  <CesiumGlobe telemetry={displayTelemetry} groundNetworkVersion={groundNetworkVersion} />
                </PopupPanel>
                <CesiumGlobe telemetry={displayTelemetry} groundNetworkVersion={groundNetworkVersion} />
              </div>
            )}
            {visible.groundtrack2d && (
              <div className="control-map-inner pp-host">
                <PopupPanel title="2D GROUND TRACK">
                  <GroundTrack2D telemetry={displayTelemetry} groundNetworkVersion={groundNetworkVersion} />
                </PopupPanel>
                <GroundTrack2D telemetry={displayTelemetry} groundNetworkVersion={groundNetworkVersion} />
              </div>
            )}
          </div>
        )}

        {(globeW || sidebarW) && <DragHandle axis="x" onDrag={onDragGlobe} className="hg1" />}

        {/* Center — Autonomy Panel */}
        {visible.autonomy && (
          <div className="control-center pp-host" style={{ gridArea: 'center' }}>
            <PopupPanel title="AUTONOMY DECISIONS">
              <AutonomyPanel telemetry={displayTelemetry} />
            </PopupPanel>
            <AutonomyPanel telemetry={displayTelemetry} />
          </div>
        )}

        {(globeW || sidebarW) && <DragHandle axis="x" onDrag={onDragSidebar} className="hg2" />}

        {/* Right — Telemetry Sidebar */}
        {visible.telemetry && (
          <div className="control-sidebar pp-host" style={{ gridArea: 'sidebar' }}>
            <PopupPanel title="TELEMETRY">
              <TelemetrySidebar telemetry={displayTelemetry} contactState={playbackFrame ? null : contactState} />
            </PopupPanel>
            <TelemetrySidebar telemetry={displayTelemetry} contactState={playbackFrame ? null : contactState} />
            <TelemetryPlayback history={telemetryHistory || []} onSelectFrame={setPlaybackFrame} />
          </div>
        )}

        {visible.strip && <DragHandle axis="y" onDrag={onDragStrip} className="hrow" />}

        {/* Bottom — Tabbed Log/Terminal + Ground Contact */}
        {visible.strip && (
          <div className="control-strip-area" style={{ gridArea: 'strip' }}>
            <div className="ctrl-bottom-grid">
              <TabbedBottomPanel alerts={alerts} contactState={contactState}
                bufferDump={bufferDump} clearBufferDump={clearBufferDump} />
              <div className="ctrl-ground-contact">
                <PassCountdown contactState={contactState} />
              </div>
            </div>
          </div>
        )}
      </div>

      {openOperation && openOperation.kind === 'telecommand_format' && (
        <TelecommandModal onClose={() => setOpenOperation(null)} />
      )}
      {openOperation && openOperation.kind === 'packets' && (
        <PacketDefinitionsModal onClose={() => setOpenOperation(null)} />
      )}
      {openOperation && !['telecommand_format', 'packets'].includes(openOperation.kind) && (
        <UploadModal
          kind={openOperation.kind}
          label={openOperation.label}
          onClose={() => setOpenOperation(null)}
        />
      )}
    </div>
  );
}
