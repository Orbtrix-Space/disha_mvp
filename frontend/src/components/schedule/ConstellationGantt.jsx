import { useEffect, useMemo, useRef, useState } from 'react';

/*
 * ConstellationGantt — swimlane Gantt for the schedule.
 *
 *   NX-01 ───███─────████──────────
 *   NX-02 ──██────████────███──────
 *   NX-03 ████──████─────────█─────
 *   REJECTED [Rxx] [Rxx] [Rxx]  ← color-coded by rejection reason
 *
 * Zoom presets (1H / 6H / 24H / FIT) pan/zoom the visible window;
 * the "now" line is dropped at the current wall-clock time when it
 * falls inside the visible range.
 */

const SAT_COLORS = { 'NX-01': '#5a7fa8', 'NX-02': '#6b9c7c', 'NX-03': '#b39148' };
const REASON_COLORS = {
  WEATHER:   '#b39148',
  CONFLICT:  '#b06560',
  NO_ACCESS: '#7e7e87',
  CAPACITY:  '#7e7e87',
};

const ZOOM_PRESETS = [
  { id: '1h',  label: '1H',  hours: 1 },
  { id: '6h',  label: '6H',  hours: 6 },
  { id: '24h', label: '24H', hours: 24 },
  { id: 'fit', label: 'FIT', hours: null },
];

function fmtTime(t) {
  const d = new Date(t);
  return `${String(d.getUTCDate()).padStart(2,'0')} ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
}

export default function ConstellationGantt({
  scheduled = [], rejected = [],
  horizonStart, horizonStop,
}) {
  const wrapRef = useRef(null);
  const [box, setBox] = useState({ w: 700, h: 280 });
  const [zoomId, setZoomId] = useState('fit');
  const [center, setCenter] = useState(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setBox({
        w: Math.max(420, entry.contentRect.width),
        h: Math.max(220, entry.contentRect.height),
      });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const hStart = horizonStart ? new Date(horizonStart).getTime() : null;
  const hStop  = horizonStop  ? new Date(horizonStop).getTime()  : null;

  // Compute visible window from zoom + center
  const { winStart, winStop } = useMemo(() => {
    if (!hStart || !hStop) return { winStart: 0, winStop: 1 };
    const preset = ZOOM_PRESETS.find((p) => p.id === zoomId);
    if (!preset || preset.hours == null) {
      return { winStart: hStart, winStop: hStop };
    }
    const halfMs = preset.hours * 3600 * 1000 / 2;
    const c = center ?? (hStart + hStop) / 2;
    let s = c - halfMs, e = c + halfMs;
    if (s < hStart) { e += (hStart - s); s = hStart; }
    if (e > hStop)  { s -= (e - hStop); e = hStop; }
    if (s < hStart) s = hStart;
    return { winStart: s, winStop: e };
  }, [zoomId, center, hStart, hStop]);

  const padL = 56;       // y-axis labels
  const padR = 12;
  const padT = 24;       // header / ticks
  const padB = 28;       // rejected lane
  const plotW = box.w - padL - padR;
  const plotH = box.h - padT - padB;

  const lanes = ['NX-01', 'NX-02', 'NX-03'];
  const laneH = (plotH - 8) / lanes.length;

  const toX = (t) => padL + ((t - winStart) / (winStop - winStart)) * plotW;

  const now = Date.now();
  const nowInView = now >= winStart && now <= winStop;

  // X tick marks — choose count by zoom span
  const span = winStop - winStart;
  const tickCount = span > 24 * 3600 * 1000 ? 8 :
                    span > 6 * 3600 * 1000  ? 6 : 5;
  const ticks = [];
  for (let i = 0; i <= tickCount; i++) {
    ticks.push(winStart + (span * i) / tickCount);
  }

  // Filter passes into the visible window
  const visibleScheduled = scheduled.filter((p) => {
    const s = new Date(p.start_time).getTime();
    const e = new Date(p.stop_time).getTime();
    return e >= winStart && s <= winStop;
  });

  // Pan: drag in the plot area
  const dragRef = useRef(null);
  const onMouseDown = (e) => {
    if (zoomId === 'fit') return;
    dragRef.current = { startX: e.clientX, startCenter: center ?? (winStart + winStop) / 2 };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  const onMove = (e) => {
    if (!dragRef.current) return;
    const dxPx = e.clientX - dragRef.current.startX;
    const dxMs = -(dxPx / plotW) * span;
    setCenter(dragRef.current.startCenter + dxMs);
  };
  const onUp = () => {
    dragRef.current = null;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };

  return (
    <div className="sch-gantt-wrap" ref={wrapRef}>
      <div className="sch-gantt-toolbar">
        <span className="sch-gantt-title">Constellation timeline</span>
        <div className="sch-gantt-zoom">
          {ZOOM_PRESETS.map((p) => (
            <button key={p.id}
                    className={`sch-zoom-btn ${zoomId === p.id ? 'on' : ''}`}
                    onClick={() => { setZoomId(p.id); setCenter(null); }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <svg width="100%" height={box.h - 32}
           viewBox={`0 0 ${box.w} ${box.h}`}
           onMouseDown={onMouseDown}
           style={{ cursor: zoomId === 'fit' ? 'default' : 'grab' }}>
        {/* Lane backgrounds */}
        {lanes.map((sat, i) => (
          <g key={sat}>
            <rect x={padL} y={padT + i * laneH}
                  width={plotW} height={laneH - 4}
                  fill="rgba(255,255,255,0.015)"
                  stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
            <text x={6} y={padT + i * laneH + laneH / 2 + 3}
                  fill={SAT_COLORS[sat]} fontFamily="Poppins, sans-serif"
                  fontSize="10.5">{sat}</text>
          </g>
        ))}

        {/* X axis grid + tick labels */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={toX(t)} y1={padT} x2={toX(t)}
                  y2={padT + plotH - 8}
                  stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
            <text x={toX(t)} y={padT - 6} textAnchor="middle"
                  fill="#7e7e87" fontFamily="Poppins, sans-serif"
                  fontSize="9">{fmtTime(t)}</text>
          </g>
        ))}

        {/* "Now" line */}
        {nowInView && (
          <g>
            <line x1={toX(now)} y1={padT - 4} x2={toX(now)}
                  y2={padT + plotH - 8}
                  stroke="#5a7fa8" strokeWidth="1" strokeDasharray="3 3" />
            <text x={toX(now) + 4} y={padT + 8}
                  fill="#5a7fa8" fontFamily="Poppins, sans-serif"
                  fontSize="9">NOW</text>
          </g>
        )}

        {/* Scheduled blocks */}
        {visibleScheduled.map((p, i) => {
          const laneIdx = lanes.indexOf(p.sat_id);
          if (laneIdx < 0) return null;
          const s = new Date(p.start_time).getTime();
          const e = new Date(p.stop_time).getTime();
          const x = toX(Math.max(s, winStart));
          const w = Math.max(2, toX(Math.min(e, winStop)) - x);
          const y = padT + laneIdx * laneH + 4;
          const h = laneH - 12;
          const color = SAT_COLORS[p.sat_id] || '#5a7fa8';
          return (
            <g key={p.request_id + i}>
              <rect x={x} y={y} width={w} height={h}
                    fill={color} fillOpacity="0.32"
                    stroke={color} strokeWidth="0.8" rx="2" />
              {w > 36 && (
                <text x={x + 4} y={y + h / 2 + 3}
                      fill="#d9d9de"
                      fontFamily="Poppins, sans-serif" fontSize="9"
                      textRendering="optimizeLegibility">{p.request_id}</text>
              )}
              <title>
                {p.aoi_name} · {p.request_id} · P{p.priority}{'\n'}
                {p.sat_id} · {fmtTime(p.start_time)} - {fmtTime(p.stop_time)}{'\n'}
                cloud {p.cloud_pct}%
              </title>
            </g>
          );
        })}

        {/* Rejected lane */}
        <g>
          <line x1={padL} y1={padT + plotH - 2}
                x2={padL + plotW} y2={padT + plotH - 2}
                stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
          <text x={6} y={padT + plotH + 12}
                fill="#b06560" fontFamily="Poppins, sans-serif"
                fontSize="10.5">REJECTED</text>
          {rejected.map((r, i) => {
            // Lay rejected pills out evenly under the timeline
            const x = padL + ((i + 0.5) / Math.max(1, rejected.length)) * plotW;
            return (
              <g key={r.request_id}>
                <circle cx={x} cy={padT + plotH + 10} r="5"
                        fill={REASON_COLORS[r.reason] || '#7e7e87'}
                        fillOpacity="0.45"
                        stroke={REASON_COLORS[r.reason] || '#7e7e87'}
                        strokeWidth="0.8" />
                <title>
                  {r.aoi_name} · {r.request_id} · P{r.priority}{'\n'}
                  {r.reason} · {r.detail}
                </title>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
