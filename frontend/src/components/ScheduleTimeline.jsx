import { useState, useEffect, useRef, useCallback } from 'react';

const HOUR_MS = 3600000;
const MIN_MS = 60000;
const DEFAULT_VIEW_HOURS = 6;
const LABEL_WIDTH = 130;
const ROW_HEIGHT = 32;
const AXIS_HEIGHT = 28;
const MIN_PX_PER_HOUR = 40;
const MAX_PX_PER_HOUR = 600;

const STATION_ORDER = [
  'ISTRAC Bangalore',
  'ISRO Lucknow',
  'Svalbard SvalSat',
  'KSAT Tromso',
  'NASA Wallops',
];

const TASK_COLORS = {
  IMAGING: { bg: 'rgba(34,197,94,0.25)', border: '#22c55e', text: '#4ade80' },
  DOWNLINK: { bg: 'rgba(249,115,22,0.25)', border: '#f97316', text: '#fb923c' },
  DEFAULT: { bg: 'rgba(168,85,247,0.25)', border: '#a855f7', text: '#c084fc' },
};

function formatAxisTime(date) {
  const h = date.getUTCHours().toString().padStart(2, '0');
  const m = date.getUTCMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

export default function ScheduleTimeline({ passes = [], tasks = [] }) {
  const containerRef = useRef(null);
  const trackRef = useRef(null);
  const [now, setNow] = useState(Date.now());
  const [viewStart, setViewStart] = useState(() => Date.now() - 30 * MIN_MS);
  const [pxPerHour, setPxPerHour] = useState(150);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ startX: 0, origViewStart: 0 });

  // Real-time NOW update
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const pxPerMs = pxPerHour / HOUR_MS;
  const viewEnd = viewStart + (DEFAULT_VIEW_HOURS * HOUR_MS * (150 / pxPerHour));

  // Convert timestamp to X position
  const timeToX = useCallback((ts) => {
    const ms = (typeof ts === 'string' ? new Date(ts).getTime() : ts) - viewStart;
    return ms * pxPerMs;
  }, [viewStart, pxPerMs]);

  // Zoom with mouse wheel
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseTime = viewStart + mouseX / pxPerMs;

    const factor = e.deltaY > 0 ? 0.88 : 1.14;
    const newPxPerHour = Math.max(MIN_PX_PER_HOUR, Math.min(MAX_PX_PER_HOUR, pxPerHour * factor));
    const newPxPerMs = newPxPerHour / HOUR_MS;

    // Keep mouse position anchored to same time
    const newViewStart = mouseTime - mouseX / newPxPerMs;
    setPxPerHour(newPxPerHour);
    setViewStart(newViewStart);
  }, [viewStart, pxPerMs, pxPerHour]);

  // Drag to pan
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    setDragging(true);
    dragRef.current = { startX: e.clientX, origViewStart: viewStart };
  }, [viewStart]);

  const handleMouseMove = useCallback((e) => {
    if (!dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dtMs = dx / pxPerMs;
    setViewStart(dragRef.current.origViewStart - dtMs);
  }, [dragging, pxPerMs]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  // Group passes by station
  const stationPasses = {};
  STATION_ORDER.forEach(s => { stationPasses[s] = []; });
  passes.forEach(p => {
    const key = p.station_name;
    if (stationPasses[key]) stationPasses[key].push(p);
  });

  // Generate time axis ticks
  const generateTicks = () => {
    const ticks = [];
    // Determine tick interval based on zoom
    let tickInterval = HOUR_MS;
    if (pxPerHour > 200) tickInterval = 30 * MIN_MS;
    if (pxPerHour > 400) tickInterval = 15 * MIN_MS;

    const firstTick = Math.ceil(viewStart / tickInterval) * tickInterval;
    const viewEndMs = viewStart + 10 * HOUR_MS; // render extra ticks

    for (let t = firstTick; t < viewEndMs; t += tickInterval) {
      const x = timeToX(t);
      if (x < -50) continue;
      if (x > 3000) break;
      const isHour = t % HOUR_MS === 0;
      ticks.push({ x, time: new Date(t), isHour });
    }
    return ticks;
  };

  const ticks = generateTicks();
  const nowX = timeToX(now);
  const totalRows = 1 + STATION_ORDER.length; // tasks row + station rows

  // Jump to NOW
  const jumpToNow = () => {
    setViewStart(Date.now() - 30 * MIN_MS);
  };

  return (
    <div className="timeline-container">
      {/* Header */}
      <div className="timeline-header">
        <span className="timeline-title">MISSION TIMELINE</span>
        <div className="timeline-controls">
          <button className="timeline-btn" onClick={jumpToNow}>NOW</button>
          <button className="timeline-btn" onClick={() => setPxPerHour(p => Math.min(MAX_PX_PER_HOUR, p * 1.3))}>+</button>
          <button className="timeline-btn" onClick={() => setPxPerHour(p => Math.max(MIN_PX_PER_HOUR, p * 0.7))}>−</button>
          <span className="timeline-zoom-label">
            {pxPerHour > 200 ? 'DETAILED' : pxPerHour > 100 ? '6H VIEW' : 'WIDE'}
          </span>
        </div>
      </div>

      <div className="timeline-body">
        {/* Row labels */}
        <div className="timeline-labels" style={{ width: LABEL_WIDTH }}>
          <div className="timeline-label-axis" style={{ height: AXIS_HEIGHT }} />
          <div className="timeline-label-row" style={{ height: ROW_HEIGHT }}>
            <span className="tl-label-dot" style={{ background: '#22c55e' }} />
            TASKS
          </div>
          {STATION_ORDER.map(station => (
            <div className="timeline-label-row" key={station} style={{ height: ROW_HEIGHT }}>
              <span className="tl-label-dot" style={{ background: '#3b82f6' }} />
              {station.split(' ').pop()}
            </div>
          ))}
        </div>

        {/* Scrollable track area */}
        <div
          className="timeline-track-area"
          ref={trackRef}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          style={{ cursor: dragging ? 'grabbing' : 'grab' }}
        >
          {/* Time axis */}
          <div className="timeline-axis" style={{ height: AXIS_HEIGHT }}>
            {ticks.map((tick, i) => (
              <div
                key={i}
                className={`timeline-tick ${tick.isHour ? 'major' : 'minor'}`}
                style={{ left: tick.x }}
              >
                <div className="tick-line" style={{ height: AXIS_HEIGHT + totalRows * ROW_HEIGHT }} />
                <span className="tick-label">{formatAxisTime(tick.time)}</span>
              </div>
            ))}
          </div>

          {/* Tasks row */}
          <div className="timeline-row" style={{ height: ROW_HEIGHT }}>
            {tasks.map((task, i) => {
              const colors = TASK_COLORS[task.action] || TASK_COLORS.DEFAULT;
              const left = timeToX(task.start_time);
              const width = Math.max(4, timeToX(task.end_time) - left);
              return (
                <div
                  key={task.task_id || i}
                  className="tl-block"
                  style={{
                    left,
                    width,
                    background: colors.bg,
                    borderColor: colors.border,
                    color: colors.text,
                  }}
                  title={`${task.task_id} | ${task.action} | ${task.power_cost_wh}Wh`}
                >
                  <span className="tl-block-text">{task.action?.slice(0, 3)}</span>
                </div>
              );
            })}
          </div>

          {/* Station rows */}
          {STATION_ORDER.map(station => (
            <div className="timeline-row" key={station} style={{ height: ROW_HEIGHT }}>
              {(stationPasses[station] || []).map((p, i) => {
                const left = timeToX(p.aos_time);
                const width = Math.max(4, timeToX(p.los_time) - left);
                return (
                  <div
                    key={i}
                    className="tl-block tl-pass"
                    style={{ left, width }}
                    title={`${p.station_name} | ${p.max_elevation_deg}° max elev | ${Math.round(p.duration_sec / 60)}min`}
                  >
                    <span className="tl-block-text">
                      {Math.round(p.duration_sec / 60)}m
                    </span>
                  </div>
                );
              })}
            </div>
          ))}

          {/* NOW cursor */}
          <div
            className="timeline-now-line"
            style={{ left: nowX, height: AXIS_HEIGHT + totalRows * ROW_HEIGHT }}
          >
            <div className="timeline-now-dot" />
            <div className="timeline-now-label">NOW</div>
          </div>
        </div>
      </div>
    </div>
  );
}
