import { useState, useEffect } from 'react';
import { Orbit, Radio, AlertTriangle, Activity } from 'lucide-react';
import { api } from '../services/api';

export default function FlightPanel() {
  const [elements, setElements] = useState(null);
  const [passes, setPasses] = useState([]);
  const [conjunction, setConjunction] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  async function fetchAll() {
    const [elemRes, passRes, conjRes] = await Promise.all([
      api.getOrbitalElements(),
      api.getGroundStationPasses(),
      api.getConjunctionAssessment(),
    ]);
    if (elemRes) setElements(elemRes);
    if (passRes) setPasses(passRes.passes || []);
    if (conjRes) setConjunction(conjRes.events || []);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flight-layout">
        <div className="flight-loading">Loading flight data...</div>
      </div>
    );
  }

  return (
    <div className="flight-layout">
      {/* Top Left: Ground Station Pass Table */}
      <div className="flight-panel pass-panel">
        <div className="flight-panel-header">
          <Radio size={16} />
          <span>Ground Station Passes (24h)</span>
        </div>
        <div className="pass-table-wrap">
          <table className="pass-table">
            <thead>
              <tr>
                <th>Station</th>
                <th>AOS</th>
                <th>LOS</th>
                <th>Duration</th>
                <th>Max Elev</th>
              </tr>
            </thead>
            <tbody>
              {passes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="pass-empty">No passes predicted</td>
                </tr>
              ) : (
                passes.map((p, i) => {
                  const now = new Date();
                  const aos = new Date(p.aos_time);
                  const los = new Date(p.los_time);
                  const isActive = now >= aos && now <= los;
                  const isUpcoming = now < aos;
                  const rowClass = isActive ? 'pass-active' : isUpcoming ? 'pass-upcoming' : 'pass-past';

                  return (
                    <tr key={i} className={rowClass}>
                      <td>{p.station_name}</td>
                      <td>{formatTime(p.aos_time)}</td>
                      <td>{formatTime(p.los_time)}</td>
                      <td>{formatDuration(p.duration_sec)}</td>
                      <td>{p.max_elevation_deg.toFixed(1)}&deg;</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Right: Orbital Elements */}
      <div className="flight-panel elements-panel">
        <div className="flight-panel-header">
          <Orbit size={16} />
          <span>Orbital Elements</span>
        </div>
        <div className="elements-grid">
          {elements ? (
            <>
              <ElementCard label="Semi-Major Axis" value={`${elements.semi_major_axis_km.toFixed(1)} km`} />
              <ElementCard label="Eccentricity" value={elements.eccentricity.toFixed(6)} />
              <ElementCard label="Inclination" value={`${elements.inclination_deg.toFixed(2)}\u00B0`} />
              <ElementCard label="RAAN" value={`${elements.raan_deg.toFixed(2)}\u00B0`} />
              <ElementCard label="Arg Periapsis" value={`${elements.arg_periapsis_deg.toFixed(2)}\u00B0`} />
              <ElementCard label="True Anomaly" value={`${elements.true_anomaly_deg.toFixed(2)}\u00B0`} />
              <ElementCard label="Period" value={`${elements.period_min.toFixed(1)} min`} />
            </>
          ) : (
            <div className="pass-empty">No data</div>
          )}
        </div>
      </div>

      {/* Bottom Left: 24h Pass Timeline */}
      <div className="flight-panel timeline-panel">
        <div className="flight-panel-header">
          <Activity size={16} />
          <span>24h Contact Timeline</span>
        </div>
        <PassTimeline passes={passes} />
      </div>

      {/* Bottom Right: Conjunction Assessment */}
      <div className="flight-panel conjunction-panel">
        <div className="flight-panel-header">
          <AlertTriangle size={16} />
          <span>Conjunction Assessment</span>
        </div>
        <div className="conjunction-list">
          {conjunction.length === 0 ? (
            <div className="pass-empty">No conjunction events</div>
          ) : (
            conjunction.map((evt, i) => (
              <div key={i} className={`conjunction-card conj-${evt.status.toLowerCase()}`}>
                <div className="conj-header">
                  <span className="conj-name">{evt.object_name}</span>
                  <span className={`conj-badge conj-badge-${evt.status.toLowerCase()}`}>
                    {evt.status}
                  </span>
                </div>
                <div className="conj-details">
                  <span>TCA: +{evt.tca_hours_ahead}h</span>
                  <span>Miss: {evt.miss_distance_km.toFixed(2)} km</span>
                  <span>Prob: {evt.collision_probability.toExponential(2)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ElementCard({ label, value }) {
  return (
    <div className="telem-card">
      <div className="telem-label">{label}</div>
      <div className="telem-value">{value}</div>
    </div>
  );
}

function PassTimeline({ passes }) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(start.getHours() - 2);
  const end = new Date(now);
  end.setHours(end.getHours() + 22);
  const totalMs = end - start;

  const stationColors = {
    'ISTRAC Bangalore': '#00d4ff',
    'ISRO Lucknow': '#00ff88',
    'Svalbard SvalSat': '#ff6b35',
    'KSAT Tromso': '#ffd700',
    'NASA Wallops': '#ff4081',
  };

  // Group passes by station for lane layout
  const stations = [...new Set(passes.map(p => p.station_name))];

  return (
    <div className="timeline-container">
      <div className="timeline-labels">
        {stations.map(s => (
          <div key={s} className="timeline-lane-label" style={{ color: stationColors[s] || '#888' }}>
            {s.split(' ')[0]}
          </div>
        ))}
      </div>
      <div className="timeline-track-area">
        {/* Time axis labels */}
        <div className="timeline-axis">
          {[0, 6, 12, 18, 24].map(h => {
            const t = new Date(start);
            t.setHours(start.getHours() + h);
            return (
              <span key={h} className="timeline-tick" style={{ left: `${(h / 24) * 100}%` }}>
                {t.toISOString().slice(11, 16)}
              </span>
            );
          })}
        </div>

        {/* Lanes */}
        {stations.map(s => {
          const stationPasses = passes.filter(p => p.station_name === s);
          return (
            <div key={s} className="timeline-lane">
              {stationPasses.map((p, i) => {
                const aos = new Date(p.aos_time);
                const los = new Date(p.los_time);
                const leftPct = Math.max(0, ((aos - start) / totalMs) * 100);
                const widthPct = Math.max(0.5, ((los - aos) / totalMs) * 100);
                return (
                  <div
                    key={i}
                    className="timeline-block"
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      backgroundColor: stationColors[s] || '#888',
                    }}
                    title={`${s}: ${formatTime(p.aos_time)} - ${formatTime(p.los_time)}`}
                  />
                );
              })}
            </div>
          );
        })}

        {/* Now marker */}
        <div
          className="timeline-now"
          style={{ left: `${((now - start) / totalMs) * 100}%` }}
        />
      </div>
    </div>
  );
}

function formatTime(iso) {
  if (!iso) return '--:--';
  return new Date(iso).toISOString().slice(11, 16) + ' UTC';
}

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}
