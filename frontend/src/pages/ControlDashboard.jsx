import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { History, Play } from 'lucide-react';
import CesiumGlobe from '../components/CesiumGlobe';
import GroundTrack2D from '../components/GroundTrack2D';
import TelemetrySidebar from '../components/Telemetry';
import AutonomyPanel from '../components/AutonomyPanel';
import PopupPanel from '../components/PopupPanel';
import LayoutManager, { LayoutWidget } from '../components/LayoutManager';
import { EventLog, CommandTerminal, PassCountdown } from '../components/ControlStrip';

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

  const exitPlayback = () => {
    setScrubIndex(null);
    if (onSelectFrame) onSelectFrame(null);
  };

  const elapsed = frameCount;
  const formatElapsed = (s) => {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

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
      <input
        type="range"
        className="telem-playback-slider"
        min={0}
        max={frameCount - 1}
        value={scrubIndex ?? frameCount - 1}
        onChange={handleScrub}
      />
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

  return (
    <div
      className={`resize-handle resize-handle-${axis} ${className || ''}`}
      onMouseDown={handleMouseDown}
    />
  );
}

/* Default layout for the bottom strip grid (12-col, ~6 rows) */
const STRIP_LAYOUT = [
  { i: 'eventlog', x: 0, y: 0, w: 5, h: 6, minW: 3, minH: 4, maxH: 8 },
  { i: 'terminal', x: 5, y: 0, w: 5, h: 6, minW: 3, minH: 4, maxH: 8 },
  { i: 'contact',  x: 10, y: 0, w: 2, h: 6, minW: 2, minH: 4, maxH: 8 },
];

export default function ControlDashboard({ telemetry, alerts, contactState, bufferDump, clearBufferDump, telemetryHistory }) {
  const containerRef = useRef(null);
  const [globeW, setGlobeW] = useState(null);
  const [sidebarW, setSidebarW] = useState(null);
  const [stripH, setStripH] = useState(null);
  const [groundNetworkVersion] = useState(0);
  const [playbackFrame, setPlaybackFrame] = useState(null);
  const startRef = useRef({});

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
    if (base) setStripH(Math.max(100, Math.min(400, base - dy)));
  }, []);

  useEffect(() => {
    const reset = () => { startRef.current = {}; };
    window.addEventListener('mouseup', reset);
    return () => window.removeEventListener('mouseup', reset);
  }, []);

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
    <div className="dashboard-layout control-layout" ref={containerRef} style={controlStyle}>
      {/* Left — Globe + Map */}
      <div className="control-globe-area" style={{ gridArea: 'globe' }}>
        <div className="control-globe-inner pp-host">
          <PopupPanel title="3D GLOBE">
            <CesiumGlobe telemetry={displayTelemetry} groundNetworkVersion={groundNetworkVersion} />
          </PopupPanel>
          <CesiumGlobe telemetry={displayTelemetry} groundNetworkVersion={groundNetworkVersion} />
        </div>
        <div className="control-map-inner pp-host">
          <PopupPanel title="2D GROUND TRACK">
            <GroundTrack2D telemetry={displayTelemetry} groundNetworkVersion={groundNetworkVersion} />
          </PopupPanel>
          <GroundTrack2D telemetry={displayTelemetry} groundNetworkVersion={groundNetworkVersion} />
        </div>
      </div>

      {(globeW || sidebarW) && <DragHandle axis="x" onDrag={onDragGlobe} className="hg1" />}

      {/* Center — Autonomy Panel */}
      <div className="control-center pp-host" style={{ gridArea: 'center' }}>
        <PopupPanel title="AUTONOMY DECISIONS">
          <AutonomyPanel telemetry={displayTelemetry} />
        </PopupPanel>
        <AutonomyPanel telemetry={displayTelemetry} />
      </div>

      {(globeW || sidebarW) && <DragHandle axis="x" onDrag={onDragSidebar} className="hg2" />}

      {/* Right — Telemetry Sidebar */}
      <div className="control-sidebar pp-host" style={{ gridArea: 'sidebar' }}>
        <PopupPanel title="TELEMETRY">
          <TelemetrySidebar telemetry={displayTelemetry} contactState={playbackFrame ? null : contactState} />
        </PopupPanel>
        <TelemetrySidebar telemetry={displayTelemetry} contactState={playbackFrame ? null : contactState} />
        <TelemetryPlayback history={telemetryHistory || []} onSelectFrame={setPlaybackFrame} />
      </div>

      <DragHandle axis="y" onDrag={onDragStrip} className="hrow" />

      {/* Bottom — Drag/Resize enabled strip */}
      <div className="control-strip-area" style={{ gridArea: 'strip' }}>
        <LayoutManager pageId="control-strip" defaultLayout={STRIP_LAYOUT} cols={12} rowHeight={28}>
          <div key="eventlog">
            <LayoutWidget title="EVENT LOG" noPad>
              <EventLog alerts={alerts} contactState={contactState} bufferDump={bufferDump} clearBufferDump={clearBufferDump} />
            </LayoutWidget>
          </div>
          <div key="terminal">
            <LayoutWidget title="COMMAND TERMINAL" noPad>
              <CommandTerminal />
            </LayoutWidget>
          </div>
          <div key="contact">
            <LayoutWidget title="GROUND CONTACT" noPad>
              <PassCountdown contactState={contactState} />
            </LayoutWidget>
          </div>
        </LayoutManager>
      </div>
    </div>
  );
}
