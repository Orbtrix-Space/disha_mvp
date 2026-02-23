import { useState, useEffect } from 'react';
import {
  Send,
  Plus,
  X,
  MapPin,
  Crosshair,
  Zap,
  Clock,
  Target,
  Rocket,
  Radio,
  CheckCircle,
  ChevronRight,
  AlertTriangle,
  Shield,
} from 'lucide-react';
import { api } from '../services/api';
import ScheduleTimeline from './ScheduleTimeline';

const CITIES = [
  { name: 'Bangalore', lat: 12.9716, lon: 77.5946 },
  { name: 'Delhi', lat: 28.7041, lon: 77.1025 },
  { name: 'Mumbai', lat: 19.076, lon: 72.8777 },
  { name: 'Chennai', lat: 13.0827, lon: 80.2707 },
  { name: 'Kolkata', lat: 22.5726, lon: 88.3639 },
  { name: 'Hyderabad', lat: 17.385, lon: 78.4867 },
  { name: 'Ahmedabad', lat: 23.0225, lon: 72.5714 },
  { name: 'Pune', lat: 18.5204, lon: 73.8567 },
  { name: 'Jaipur', lat: 26.9124, lon: 75.7873 },
  { name: 'Lucknow', lat: 26.8467, lon: 80.9462 },
];

const PRIORITY_LEVELS = [
  { value: 10, label: 'CRIT', className: 'high' },
  { value: 7, label: 'HIGH', className: 'high' },
  { value: 5, label: 'MED', className: 'medium' },
  { value: 3, label: 'LOW', className: 'low' },
];

function formatTime(iso) {
  if (!iso) return '--:--';
  return new Date(iso).toISOString().slice(11, 16) + ' UTC';
}

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

export default function SchedulePanel() {
  const [targets, setTargets] = useState([]);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [priority, setPriority] = useState(5);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [passes, setPasses] = useState([]);
  const [commandSeq, setCommandSeq] = useState(null);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    api.getGroundStationPasses().then((data) => {
      if (data && data.passes) setPasses(data.passes.slice(0, 8));
    });
  }, []);

  const addTarget = () => {
    const latVal = parseFloat(lat);
    const lonVal = parseFloat(lon);
    if (isNaN(latVal) || isNaN(lonVal)) return;
    if (latVal < -90 || latVal > 90 || lonVal < -180 || lonVal > 180) return;
    setTargets((prev) => [
      ...prev,
      { lat: latVal, lon: lonVal, priority, id: Date.now() },
    ]);
    setLat('');
    setLon('');
  };

  const addCity = (city) => {
    setTargets((prev) => [
      ...prev,
      {
        lat: city.lat,
        lon: city.lon,
        priority: 5 + Math.floor(Math.random() * 5),
        id: Date.now() + Math.random(),
        name: city.name,
      },
    ]);
  };

  const removeTarget = (id) => {
    setTargets((prev) => prev.filter((t) => t.id !== id));
  };

  const submitPlan = async () => {
    if (targets.length === 0) return;
    setLoading(true);
    setResult(null);
    setCommandSeq(null);

    const payload = targets.map((t) => ({
      lat: t.lat,
      lon: t.lon,
      priority: t.priority,
    }));

    const data = await api.generatePlan(payload);
    setLoading(false);

    if (data) {
      setResult(data);
      // Fetch associated command sequence
      if (data.command_sequence_id) {
        const seqs = await api.getCommandSequences();
        if (seqs && seqs.sequences) {
          const seq = seqs.sequences.find(
            (s) => s.sequence_id === data.command_sequence_id
          );
          if (seq) setCommandSeq(seq);
        }
      }
    }
  };

  const handleApprove = async () => {
    if (!commandSeq) return;
    setApproving(true);
    const res = await api.approveCommandSequence(commandSeq.sequence_id);
    setApproving(false);
    if (res) {
      setCommandSeq({ ...commandSeq, status: 'APPROVED', approved_by: 'OPERATOR' });
    }
  };

  const clearAll = () => {
    setTargets([]);
    setResult(null);
    setCommandSeq(null);
  };

  const getPriorityClass = (p) => {
    if (p >= 8) return 'high';
    if (p >= 4) return 'medium';
    return 'low';
  };

  return (
    <div className="schedule-wrapper">
      {/* Timeline strip at top */}
      <ScheduleTimeline
        passes={passes}
        tasks={result?.plan_details || []}
      />

      <div className="schedule-layout">
      {/* LEFT COLUMN: Task Input */}
      <div className="schedule-col schedule-input-col">
        <div className="schedule-col-header">
          <Target size={14} /> Task Input
        </div>
        <div className="schedule-col-body">
          {/* Quick city select */}
          <div className="form-group">
            <label className="form-label">Quick Select City</label>
            <div className="quick-select-grid">
              {CITIES.map((city) => (
                <button
                  key={city.name}
                  className="quick-city-btn"
                  onClick={() => addCity(city)}
                >
                  <MapPin size={12} />
                  {city.name}
                </button>
              ))}
            </div>
          </div>

          {/* Manual coordinates */}
          <div className="form-group">
            <label className="form-label">Manual Coordinates</label>
            <div className="form-row">
              <input
                className="form-input"
                type="number"
                placeholder="Latitude"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                min={-90}
                max={90}
                step={0.01}
              />
              <input
                className="form-input"
                type="number"
                placeholder="Longitude"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                min={-180}
                max={180}
                step={0.01}
              />
            </div>
          </div>

          {/* Priority */}
          <div className="form-group">
            <label className="form-label">Priority</label>
            <div className="priority-select">
              {PRIORITY_LEVELS.map((p) => (
                <button
                  key={p.value}
                  className={`priority-option ${priority === p.value ? `selected ${p.className}` : ''}`}
                  onClick={() => setPriority(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <button className="btn btn-add" onClick={addTarget} disabled={!lat || !lon}>
            <Plus size={16} /> Add Target
          </button>

          {/* Target list */}
          {targets.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <label className="form-label">Targets ({targets.length})</label>
              <div className="target-list">
                {targets.map((t) => (
                  <div className="target-chip" key={t.id}>
                    <div className="target-chip-info">
                      <span className={`target-chip-priority ${getPriorityClass(t.priority)}`}>
                        P{t.priority}
                      </span>
                      <span className="target-chip-coords">
                        {t.name
                          ? `${t.name} (${t.lat.toFixed(2)}, ${t.lon.toFixed(2)})`
                          : `${t.lat.toFixed(4)}, ${t.lon.toFixed(4)}`}
                      </span>
                    </div>
                    <button className="target-chip-remove" onClick={() => removeTarget(t.id)}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="form-actions">
          <button
            className="btn btn-secondary"
            onClick={clearAll}
            style={{ flex: '0 0 auto', width: 'auto', padding: '12px 16px' }}
          >
            Clear
          </button>
          <button
            className="btn btn-primary"
            onClick={submitPlan}
            disabled={targets.length === 0 || loading}
          >
            {loading ? (
              <>
                <span className="spinner" /> Computing...
              </>
            ) : (
              <>
                <Rocket size={16} /> Generate Plan
              </>
            )}
          </button>
        </div>
      </div>

      {/* CENTER COLUMN: Results + Passes */}
      <div className="schedule-col schedule-results-col">
        <div className="schedule-col-header">
          <Send size={14} /> Schedule Results
        </div>
        <div className="schedule-col-body">
          {!result && !loading && (
            <div className="empty-state" style={{ paddingTop: 60 }}>
              <Target size={48} />
              <div className="empty-state-title">No Mission Plan</div>
              <div className="empty-state-desc">
                Add imaging targets and click "Generate Plan" to run scheduling.
              </div>
            </div>
          )}

          {loading && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: 200, gap: 16,
            }}>
              <div className="spinner" style={{ width: 32, height: 32 }} />
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Running J2 Orbit Propagation...
              </div>
            </div>
          )}

          {result && (
            <>
              {/* Stats bar */}
              <div className="results-stats" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
                <div className="result-stat">
                  <div className="result-stat-value" style={{ color: 'var(--accent-cyan)' }}>
                    {result.total_requests}
                  </div>
                  <div className="result-stat-label">Submitted</div>
                </div>
                <div className="result-stat">
                  <div className="result-stat-value" style={{ color: 'var(--accent-yellow)' }}>
                    {result.feasible_requests}
                  </div>
                  <div className="result-stat-label">Feasible</div>
                </div>
                <div className="result-stat">
                  <div className="result-stat-value" style={{ color: 'var(--accent-green)' }}>
                    {result.scheduled_tasks}
                  </div>
                  <div className="result-stat-label">Scheduled</div>
                </div>
                <div className="result-stat">
                  <div
                    className="result-stat-value"
                    style={{
                      color: result.satellite_health?.battery_pct > 50
                        ? 'var(--accent-green)' : 'var(--accent-red)',
                    }}
                  >
                    {result.satellite_health?.battery_pct}%
                  </div>
                  <div className="result-stat-label">Battery After</div>
                </div>
              </div>

              {/* Conflict warnings */}
              {result.conflicts && result.conflicts.length > 0 && (
                <div className="schedule-conflicts">
                  {result.conflicts.map((c, i) => (
                    <div key={i} className={`schedule-conflict-card ${c.severity === 'CRITICAL' ? 'critical' : 'warning'}`}>
                      <AlertTriangle size={12} />
                      <span>{c.reason}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Task cards with feasibility */}
              {result.plan_details && result.plan_details.length > 0 ? (
                <div className="task-list">
                  {result.plan_details.map((task, i) => {
                    const fScore = result.feasibility_scores?.[i];
                    const scoreColor = fScore
                      ? fScore.feasibility_score >= 0.75 ? 'var(--accent-green)'
                        : fScore.feasibility_score >= 0.5 ? 'var(--accent-yellow)'
                        : 'var(--accent-red)'
                      : 'var(--text-muted)';
                    return (
                      <div className="task-card" key={task.task_id}>
                        <div className="task-index">{String(i + 1).padStart(2, '0')}</div>
                        <div className="task-info">
                          <div className="task-id">
                            <Crosshair size={12} style={{ display: 'inline', marginRight: 6, color: 'var(--accent-cyan)' }} />
                            {task.task_id}
                          </div>
                          <div className="task-time">
                            <Clock size={10} style={{ display: 'inline', marginRight: 4 }} />
                            {new Date(task.start_time).toLocaleTimeString()} -{' '}
                            {new Date(task.end_time).toLocaleTimeString()}
                          </div>
                          {fScore && (
                            <div className="task-feasibility">
                              <Shield size={9} style={{ color: scoreColor }} />
                              <span style={{ color: scoreColor }}>
                                {(fScore.feasibility_score * 100).toFixed(0)}%
                              </span>
                              <span className={`task-risk-tag ${fScore.risk_level.toLowerCase()}`}>
                                {fScore.risk_level}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="task-costs">
                          <div className="task-cost-item">
                            <div className="task-cost-value" style={{ color: 'var(--accent-yellow)' }}>
                              <Zap size={10} style={{ display: 'inline', marginRight: 2 }} />
                              {task.power_cost_wh} Wh
                            </div>
                            <div className="task-cost-label">Power</div>
                          </div>
                          <div className="task-cost-item">
                            <div className="task-cost-value" style={{ color: 'var(--accent-purple)' }}>
                              {task.data_cost_gb.toFixed(1)} Gb
                            </div>
                            <div className="task-cost-label">Data</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  <Crosshair size={36} />
                  <div className="empty-state-title">No Tasks Scheduled</div>
                  <div className="empty-state-desc">
                    No targets were visible within the planning window.
                  </div>
                </div>
              )}
            </>
          )}

          {/* Passes table */}
          {passes.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div className="section-title" style={{ marginBottom: 10 }}>
                <Radio size={14} /> Upcoming Contacts
              </div>
              <table className="pass-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Station</th>
                    <th>AOS</th>
                    <th>LOS</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {passes.map((p, i) => (
                    <tr key={i}>
                      <td>{p.station_name}</td>
                      <td>{formatTime(p.aos_time)}</td>
                      <td>{formatTime(p.los_time)}</td>
                      <td>{formatDuration(p.duration_sec)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Command Sequence Preview */}
      <div className="schedule-col schedule-command-col">
        <div className="schedule-col-header">
          <ChevronRight size={14} /> Telecommand Sequence
        </div>
        <div className="schedule-col-body">
          {!commandSeq ? (
            <div className="empty-state" style={{ paddingTop: 60 }}>
              <Send size={36} />
              <div className="empty-state-title">No Sequence</div>
              <div className="empty-state-desc">
                Generate a plan to see the telecommand sequence.
              </div>
            </div>
          ) : (
            <>
              {/* Sequence info */}
              <div className="command-seq-header">
                <div className="command-seq-id">{commandSeq.sequence_id}</div>
                <div className={`command-seq-status ${commandSeq.status.toLowerCase()}`}>
                  {commandSeq.status}
                </div>
              </div>

              {/* Commands list */}
              <div className="command-list">
                {commandSeq.commands.map((cmd, i) => (
                  <div className="command-card" key={i}>
                    <div className="command-index">{String(i + 1).padStart(2, '0')}</div>
                    <div className="command-info">
                      <div className="command-name">{cmd.command}</div>
                      {cmd.parameters && Object.keys(cmd.parameters).length > 0 && (
                        <div className="command-params">
                          {Object.entries(cmd.parameters).map(([k, v]) => (
                            <span key={k} className="command-param">
                              {k}: {typeof v === 'number' ? v.toFixed(2) : String(v)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="command-delay">+{cmd.delay_sec}s</div>
                  </div>
                ))}
              </div>

              {/* Approve button */}
              {commandSeq.status === 'PENDING' && (
                <div style={{ padding: '12px 0' }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleApprove}
                    disabled={approving}
                  >
                    {approving ? (
                      <>
                        <span className="spinner" /> Approving...
                      </>
                    ) : (
                      <>
                        <CheckCircle size={16} /> Approve Sequence
                      </>
                    )}
                  </button>
                </div>
              )}

              {commandSeq.status === 'APPROVED' && (
                <div className="command-approved-badge">
                  <CheckCircle size={14} />
                  Approved by {commandSeq.approved_by || 'OPERATOR'}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
