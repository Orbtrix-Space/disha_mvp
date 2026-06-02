import { useEffect, useRef, useState } from 'react';

/*
 * OrbitPlanesPlot — SVG isometric projection of the 3 orbital planes
 * around a small Earth wireframe. Not photoreal — the goal is to
 * communicate "3 SSO planes, RAAN-spaced" at a glance. Each track is
 * drawn from the backend-sampled lat/lon/alt points so the
 * inclination + RAAN look right.
 *
 * Props:
 *   tracks: [{ sat_id, color, samples: [{ x_km, y_km, z_km, ... }] }]
 */

const ROTATE_X_DEG = 28;     // tilt to give iso-y depth
const ROTATE_Z_DEG = -15;    // azimuth twist
const PADDING = 18;

function project(p, scale, cx, cy, rx, rz) {
  const cosRz = Math.cos(rz), sinRz = Math.sin(rz);
  const x1 = p.x_km * cosRz - p.y_km * sinRz;
  const y1 = p.x_km * sinRz + p.y_km * cosRz;
  const z1 = p.z_km;
  const cosRx = Math.cos(rx), sinRx = Math.sin(rx);
  const y2 = y1 * cosRx - z1 * sinRx;
  const z2 = y1 * sinRx + z1 * cosRx;
  // Orthographic: keep x, project (y, z) → screen (sx, sy)
  return { sx: cx + x1 * scale, sy: cy - y2 * scale, depth: z2 };
}

export default function OrbitPlanesPlot({ tracks = [] }) {
  const wrapRef = useRef(null);
  const [box, setBox] = useState({ w: 360, h: 280 });

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ w: Math.max(220, width), h: Math.max(220, height) });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  if (!tracks.length) {
    return (
      <div className="sch-plot-empty">
        Loading orbital tracks…
      </div>
    );
  }

  // Estimate scale from the largest sample magnitude
  const maxR = tracks.reduce((m, t) => {
    return t.samples.reduce((mm, s) => {
      const r = Math.sqrt(s.x_km*s.x_km + s.y_km*s.y_km + s.z_km*s.z_km);
      return Math.max(mm, r);
    }, m);
  }, 6378);
  const minDim = Math.min(box.w, box.h) - PADDING * 2;
  const scale = (minDim / 2) / maxR;
  const cx = box.w / 2;
  const cy = box.h / 2;

  const rx = ROTATE_X_DEG * Math.PI / 180;
  const rz = ROTATE_Z_DEG * Math.PI / 180;

  const earthR = 6378 * scale;

  // Project tracks
  const projectedTracks = tracks.map((t) => ({
    ...t,
    points: t.samples.map((s) => project(s, scale, cx, cy, rx, rz)),
  }));

  // Sort points by depth for over/under painting? Skip — visual clutter
  // is OK; the lines tell the story regardless of depth order.

  return (
    <div className="sch-plot-wrap" ref={wrapRef}>
      <svg width="100%" height="100%" viewBox={`0 0 ${box.w} ${box.h}`}>
        {/* Earth wireframe — equator + meridians */}
        <ellipse cx={cx} cy={cy} rx={earthR} ry={earthR * Math.cos(rx)}
                 fill="rgba(74, 111, 147, 0.04)"
                 stroke="rgba(74, 111, 147, 0.35)" strokeWidth="0.8" />
        <ellipse cx={cx} cy={cy} rx={earthR} ry={earthR * Math.cos(rx)}
                 fill="none" stroke="rgba(74, 111, 147, 0.20)"
                 strokeWidth="0.6" strokeDasharray="2 3" />
        <ellipse cx={cx} cy={cy} rx={earthR * Math.cos(rx)} ry={earthR}
                 fill="none" stroke="rgba(74, 111, 147, 0.18)"
                 strokeWidth="0.6" />
        {/* North pole indicator */}
        <line x1={cx} y1={cy - earthR} x2={cx} y2={cy - earthR - 12}
              stroke="rgba(74, 111, 147, 0.5)" strokeWidth="0.6" />
        <text x={cx + 3} y={cy - earthR - 6}
              fill="rgba(74, 111, 147, 0.6)"
              fontFamily="Poppins, sans-serif" fontSize="9">N</text>

        {/* Orbits */}
        {projectedTracks.map((t) => {
          const d = t.points.map((p, i) =>
            `${i === 0 ? 'M' : 'L'} ${p.sx.toFixed(1)} ${p.sy.toFixed(1)}`
          ).join(' ');
          return (
            <g key={t.sat_id}>
              <path d={d} fill="none" stroke={t.color}
                    strokeWidth="1.4" opacity="0.85" />
              {/* Sat marker — last sample */}
              {t.points.length > 0 && (
                <>
                  <circle cx={t.points[t.points.length - 1].sx}
                          cy={t.points[t.points.length - 1].sy}
                          r="3.5" fill={t.color} />
                  <text x={t.points[t.points.length - 1].sx + 6}
                        y={t.points[t.points.length - 1].sy + 3}
                        fill={t.color}
                        fontFamily="Poppins, sans-serif"
                        fontSize="9.5">{t.sat_id}</text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
