import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { History, Play, Pause, SkipBack } from 'lucide-react';
import CesiumGlobe from '../components/CesiumGlobe';
import GroundTrack2D from '../components/GroundTrack2D';
import TelemetrySidebar from '../components/Telemetry';
import ControlStrip from '../components/ControlStrip';

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

  const elapsed = frameCount; // seconds of data
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

export default function ControlDashboard({ telemetry, alerts, contactState, bufferDump, clearBufferDump, telemetryHistory }) {
  const containerRef = useRef(null);
  const [globeW, setGlobeW] = useState(null);
  const [sidebarW, setSidebarW] = useState(340);
  const [stripH, setStripH] = useState(210);
  const [groundNetworkVersion, setGroundNetworkVersion] = useState(0);
  const [playbackFrame, setPlaybackFrame] = useState(null);
  const startRef = useRef({});

  // Show playback frame if scrubbing, otherwise live telemetry
  const displayTelemetry = playbackFrame || telemetry;

  const onDragGlobe = useCallback((dx) => {
    if (startRef.current.globeW == null) {
      const el = containerRef.current?.querySelector('.control-globe');
      if (el) startRef.current.globeW = el.offsetWidth;
    }
    const base = startRef.current.globeW;
    if (base) setGlobeW(Math.max(200, base + dx));
  }, []);

  const onDragSidebar = useCallback((dx) => {
    if (startRef.current.sidebarW == null) startRef.current.sidebarW = sidebarW;
    const base = startRef.current.sidebarW;
    setSidebarW(Math.max(240, Math.min(600, base - dx)));
  }, [sidebarW]);

  const onDragStrip = useCallback((dy) => {
    if (startRef.current.stripH == null) startRef.current.stripH = stripH;
    const base = startRef.current.stripH;
    setStripH(Math.max(120, Math.min(400, base - dy)));
  }, [stripH]);

  useEffect(() => {
    const reset = () => { startRef.current = {}; };
    window.addEventListener('mouseup', reset);
    return () => window.removeEventListener('mouseup', reset);
  }, []);

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
    <div className="dashboard-layout control-layout" ref={containerRef} style={controlStyle}>
      <div className="control-globe" style={{ gridArea: 'globe' }}>
        <CesiumGlobe telemetry={displayTelemetry} groundNetworkVersion={groundNetworkVersion} />
      </div>
      <DragHandle axis="x" onDrag={onDragGlobe} className="hg1" />
      <div className="control-map" style={{ gridArea: 'map' }}>
        <GroundTrack2D telemetry={displayTelemetry} groundNetworkVersion={groundNetworkVersion} />
      </div>
      <DragHandle axis="x" onDrag={onDragSidebar} className="hg2" />
      <div className="control-sidebar" style={{ gridArea: 'sidebar' }}>
        <TelemetrySidebar telemetry={displayTelemetry} contactState={playbackFrame ? null : contactState} />
        <TelemetryPlayback history={telemetryHistory || []} onSelectFrame={setPlaybackFrame} />
      </div>
      <DragHandle axis="y" onDrag={onDragStrip} className="hrow" />
      <div className="control-strip-area" style={{ gridArea: 'strip' }}>
        <ControlStrip alerts={alerts} contactState={contactState} bufferDump={bufferDump} clearBufferDump={clearBufferDump} />
      </div>
    </div>
  );
}
