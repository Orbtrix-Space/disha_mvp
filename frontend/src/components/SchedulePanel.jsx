import { useState, useEffect, useMemo } from 'react';
import {
  Send, Plus, X, MapPin, Crosshair, Zap, Clock, Target, Rocket, Radio,
  CheckCircle, ChevronRight, AlertTriangle, Shield, Battery, Database,
  TrendingUp, Activity, Eye,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer,
  ReferenceLine, Tooltip, CartesianGrid,
} from 'recharts';
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

function ChartTooltipContent({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">T+{label}m</div>
      {payload.map((p, i) => (
        <div key={i} className="chart-tooltip-row">
          <span style={{ color: p.color }}>{p.name}:</span> <span>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   CENTER — Intelligent Planning Display
   (replaces "No Mission Plan" empty state)
   ═══════════════════════════════════════════════════ */

/* Mission Plan Summary */
function PlanSummary({ result }) {
  if (!result) return null;
  const tasks = result.plan_details || [];
  const totalPower = tasks.reduce((s, t) => s + (t.power_cost_wh || 0), 0);
  const totalData = tasks.reduce((s, t) => s + (t.data_cost_gb || 0), 0);
  const feasScore = result.feasibility_scores?.length > 0
    ? Math.round(result.feasibility_scores.reduce((s, f) => s + (f.feasibility_score || 0), 0) / result.feasibility_scores.length * 100)
    : 0;

  return (
    <div className="sched-card">
      <div className="sched-card-header"><Activity size={12} /> MISSION PLAN SUMMARY</div>
      <div className="sched-card-body">
        <div className="sched-summary-grid">
          <div className="sched-summary-item">
            <span className="sched-sum-val cyan">{result.total_requests}</span>
            <span className="sched-sum-label">Targets</span>
          </div>
          <div className="sched-summary-item">
            <span className="sched-sum-val green">{result.feasible_requests}</span>
            <span className="sched-sum-label">Feasible</span>
          </div>
          <div className="sched-summary-item">
            <span className="sched-sum-val" style={{ color: result.scheduled_tasks > 0 ? '#5eead4' : '#ef4444' }}>{result.scheduled_tasks}</span>
            <span className="sched-sum-label">Scheduled</span>
          </div>
          <div className="sched-summary-item">
            <span className="sched-sum-val purple">{totalPower.toFixed(1)}</span>
            <span className="sched-sum-label">Power (Wh)</span>
          </div>
          <div className="sched-summary-item">
            <span className="sched-sum-val yellow">{totalData.toFixed(1)}</span>
            <span className="sched-sum-label">Data (Gb)</span>
          </div>
          <div className="sched-summary-item">
            <span className="sched-sum-val" style={{ color: feasScore > 70 ? '#5eead4' : feasScore > 40 ? '#eab308' : '#ef4444' }}>{feasScore}%</span>
            <span className="sched-sum-label">Feasibility</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Constraint Evaluation */
function ConstraintEvaluation({ result }) {
  const health = result?.satellite_health || {};
  const constraints = [
    { name: 'Power', icon: Battery, pass: (health.battery_pct || 100) > 20, value: `${(health.battery_pct || 100).toFixed(1)}%`, threshold: '> 20%' },
    { name: 'Storage', icon: Database, pass: (health.storage_pct || 0) < 95, value: `${(health.storage_pct || 0).toFixed(1)}%`, threshold: '< 95%' },
    { name: 'Attitude', icon: Target, pass: true, value: 'NADIR', threshold: 'Stable' },
    { name: 'Sun Angle', icon: Eye, pass: !health.in_eclipse, value: health.in_eclipse ? 'ECLIPSE' : 'SUNLIT', threshold: 'Sunlit' },
  ];

  return (
    <div className="sched-card">
      <div className="sched-card-header"><Shield size={12} /> CONSTRAINT EVALUATION</div>
      <div className="sched-card-body">
        <div className="sched-constraint-list">
          {constraints.map((c, i) => {
            const Icon = c.icon;
            return (
              <div key={i} className="sched-constraint-row">
                <Icon size={10} style={{ color: '#666', flexShrink: 0 }} />
                <span className="sched-cons-name">{c.name}</span>
                <span className="sched-cons-val">{c.value}</span>
                <span className={`sched-cons-badge ${c.pass ? 'pass' : 'fail'}`}>{c.pass ? 'PASS' : 'FAIL'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* Resource Projection (power graph) */
function ResourceProjection() {
  const [powerData, setPowerData] = useState(null);

  useEffect(() => {
    const fetch = () => api.getPowerPrediction().then(d => { if (d?.prediction_points) setPowerData(d); });
    fetch();
    const id = setInterval(fetch, 30000);
    return () => clearInterval(id);
  }, []);

  const drainData = powerData?.prediction_points?.map(p => ({
    t: p.time_offset_min, soc: p.soc_pct, storage: p.storage_pct,
  })) || [];

  return (
    <div className="sched-card">
      <div className="sched-card-header"><Zap size={12} /> RESOURCE PROJECTION</div>
      <div className="sched-card-body">
        {drainData.length > 0 ? (
          <>
            <div style={{ height: 70 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={drainData}>
                  <defs>
                    <linearGradient id="schedSocG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                  <XAxis dataKey="t" tick={{ fontSize: 8, fill: '#555' }} tickFormatter={v => `${v}m`} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 8, fill: '#555' }} tickFormatter={v => `${v}%`} width={24} />
                  <Tooltip content={<ChartTooltipContent />} />
                  <ReferenceLine y={20} stroke="#ef4444" strokeDasharray="3 3" />
                  <Area type="monotone" dataKey="soc" name="Battery" stroke="#2dd4bf" fill="url(#schedSocG)" strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="sched-resource-stats">
              <span>Min SOC: <b>{powerData.min_soc_pct}%</b></span>
              <span>Margin: <b>{powerData.power_margin_wh} Wh</b></span>
            </div>
          </>
        ) : (
          <div className="sched-empty">Loading projection...</div>
        )}
      </div>
    </div>
  );
}

/* Pre-plan intelligence (shown before plan generation) */
function PrePlanIntel({ targetCount }) {
  const [powerData, setPowerData] = useState(null);
  const [passes, setPasses] = useState([]);

  useEffect(() => {
    api.getPowerPrediction().then(d => { if (d?.prediction_points) setPowerData(d); });
    api.getGroundStationPasses().then(d => { if (d?.passes) setPasses(d.passes.slice(0, 4)); });
  }, []);

  return (
    <>
      {/* Current resource state */}
      <div className="sched-card">
        <div className="sched-card-header"><Activity size={12} /> PLANNING READINESS</div>
        <div className="sched-card-body">
          <div className="sched-readiness-grid">
            <div className="sched-readiness-item">
              <span className="sched-ready-label">Targets Queued</span>
              <span className="sched-ready-val" style={{ color: targetCount > 0 ? '#5eead4' : '#555' }}>{targetCount}</span>
            </div>
            <div className="sched-readiness-item">
              <span className="sched-ready-label">Power Available</span>
              <span className="sched-ready-val green">{powerData ? `${powerData.min_soc_pct}%` : '—'}</span>
            </div>
            <div className="sched-readiness-item">
              <span className="sched-ready-label">Contacts (6h)</span>
              <span className="sched-ready-val cyan">{passes.length}</span>
            </div>
            <div className="sched-readiness-item">
              <span className="sched-ready-label">Margin</span>
              <span className="sched-ready-val">{powerData ? `${powerData.power_margin_wh} Wh` : '—'}</span>
            </div>
          </div>
        </div>
      </div>

      <ResourceProjection />

      {/* Upcoming windows */}
      {passes.length > 0 && (
        <div className="sched-card">
          <div className="sched-card-header"><Radio size={12} /> VISIBILITY WINDOWS</div>
          <div className="sched-card-body">
            {passes.map((p, i) => (
              <div key={i} className="sched-window-item">
                <span className="sched-win-station">{p.station_name?.replace('ISTRAC ', '')}</span>
                <span className="sched-win-time">{formatTime(p.aos_time)} → {formatTime(p.los_time)}</span>
                <span className="sched-win-elev">{p.max_elevation_deg}°</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN SCHEDULE PANEL
   ═══════════════════════════════════════════════════ */
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
    api.getGroundStationPasses().then(d => { if (d?.passes) setPasses(d.passes.slice(0, 8)); });
  }, []);

  const addTarget = () => {
    const latVal = parseFloat(lat), lonVal = parseFloat(lon);
    if (isNaN(latVal) || isNaN(lonVal) || latVal < -90 || latVal > 90 || lonVal < -180 || lonVal > 180) return;
    setTargets(prev => [...prev, { lat: latVal, lon: lonVal, priority, id: Date.now() }]);
    setLat(''); setLon('');
  };

  const addCity = (city) => {
    setTargets(prev => [...prev, { lat: city.lat, lon: city.lon, priority: 5 + Math.floor(Math.random() * 5), id: Date.now() + Math.random(), name: city.name }]);
  };

  const removeTarget = (id) => setTargets(prev => prev.filter(t => t.id !== id));

  const submitPlan = async () => {
    if (targets.length === 0) return;
    setLoading(true); setResult(null); setCommandSeq(null);
    const data = await api.generatePlan(targets.map(t => ({ lat: t.lat, lon: t.lon, priority: t.priority })));
    setLoading(false);
    if (data) {
      setResult(data);
      if (data.command_sequence_id) {
        const seqs = await api.getCommandSequences();
        if (seqs?.sequences) {
          const seq = seqs.sequences.find(s => s.sequence_id === data.command_sequence_id);
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
    if (res) setCommandSeq({ ...commandSeq, status: 'APPROVED', approved_by: 'OPERATOR' });
  };

  const clearAll = () => { setTargets([]); setResult(null); setCommandSeq(null); };
  const getPriorityClass = (p) => p >= 8 ? 'high' : p >= 4 ? 'medium' : 'low';

  // Feasibility score
  const overallFeasibility = useMemo(() => {
    if (!result?.feasibility_scores?.length) return null;
    return Math.round(result.feasibility_scores.reduce((s, f) => s + (f.feasibility_score || 0), 0) / result.feasibility_scores.length * 100);
  }, [result]);

  return (
    <div className="schedule-panel-v2">
      {/* Timeline spans full width at top */}
      <div className="sched-timeline-area">
        <ScheduleTimeline tasks={result?.plan_details} passes={passes} />
      </div>

      <div className="sched-columns">
        {/* LEFT: Task Input — compact layout */}
        <div className="schedule-col schedule-input-col">
          <div className="schedule-col-header"><MapPin size={13} /> Task Input</div>
          <div className="sched-input-body">
            {/* Location buttons — compact grid */}
            <div className="sched-city-grid">
              {CITIES.map(c => (
                <button key={c.name} className="sched-city-btn" onClick={() => addCity(c)}>
                  {c.name}
                </button>
              ))}
            </div>

            {/* Lat/Lon side-by-side + Add button */}
            <div className="sched-coord-row">
              <input className="form-input sched-coord-input" type="number" placeholder="Lat" value={lat} onChange={e => setLat(e.target.value)} min={-90} max={90} step={0.01} />
              <input className="form-input sched-coord-input" type="number" placeholder="Lon" value={lon} onChange={e => setLon(e.target.value)} min={-180} max={180} step={0.01} />
              <button className="sched-add-btn" onClick={addTarget} disabled={!lat || !lon} title="Add Target">
                <Plus size={12} />
              </button>
            </div>

            {/* Priority — segmented control */}
            <div className="sched-priority-seg">
              {PRIORITY_LEVELS.map(p => (
                <button key={p.value} className={`sched-pri-opt ${priority === p.value ? `active ${p.className}` : ''}`}
                  onClick={() => setPriority(p.value)}>{p.label}</button>
              ))}
            </div>

            {/* Target list — scrollable */}
            {targets.length > 0 && (
              <div className="sched-target-area">
                <div className="sched-target-header">Targets ({targets.length})</div>
                <div className="sched-target-list">
                  {targets.map(t => (
                    <div className="sched-target-chip" key={t.id}>
                      <span className={`sched-target-pri ${getPriorityClass(t.priority)}`}>P{t.priority}</span>
                      <span className="sched-target-name">
                        {t.name || `${t.lat.toFixed(2)}, ${t.lon.toFixed(2)}`}
                      </span>
                      <button className="sched-target-rm" onClick={() => removeTarget(t.id)}><X size={10} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sticky action bar */}
          <div className="sched-action-bar">
            <button className="sched-action-clear" onClick={clearAll}>Clear</button>
            <button className="sched-action-gen" onClick={submitPlan} disabled={targets.length === 0 || loading}>
              {loading ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Plan...</> : <><Rocket size={12} /> Generate</>}
            </button>
          </div>
        </div>

        {/* CENTER: Results + Intelligence */}
        <div className="schedule-col schedule-results-col">
          <div className="schedule-col-header"><Send size={13} /> Mission Planning Engine</div>
          <div className="schedule-col-body">
            {loading && (
              <div className="empty-state" style={{ paddingTop: 40 }}>
                <span className="spinner" style={{ width: 32, height: 32 }} />
                <div className="empty-state-desc">Computing optimal plan...</div>
              </div>
            )}

            {!result && !loading && <PrePlanIntel targetCount={targets.length} />}

            {result && !loading && (
              <>
                {/* Feasibility Score Banner */}
                {overallFeasibility != null && (
                  <div className={`sched-feasibility-banner ${overallFeasibility > 70 ? 'pass' : overallFeasibility > 40 ? 'warn' : 'fail'}`}>
                    <div className="sched-feas-score">{overallFeasibility}%</div>
                    <div className="sched-feas-info">
                      <span className="sched-feas-title">Overall Feasibility</span>
                      <span className="sched-feas-desc">
                        {overallFeasibility > 70 ? 'Plan is feasible with good margins' :
                         overallFeasibility > 40 ? 'Plan feasible with constraints' : 'Plan has significant risks'}
                      </span>
                    </div>
                  </div>
                )}

                <PlanSummary result={result} />
                <ConstraintEvaluation result={result} />
                <ResourceProjection />

                {/* Conflicts */}
                {result.conflicts?.length > 0 && (
                  <div className="sched-card">
                    <div className="sched-card-header" style={{ color: '#ef4444' }}><AlertTriangle size={12} /> CONFLICTS</div>
                    <div className="sched-card-body">
                      {result.conflicts.map((c, i) => (
                        <div key={i} className="sched-conflict-item">
                          <AlertTriangle size={9} style={{ color: c.severity === 'CRITICAL' ? '#ef4444' : '#eab308', flexShrink: 0 }} />
                          <span>{c.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Task cards */}
                {result.plan_details?.length > 0 && (
                  <div className="sched-card">
                    <div className="sched-card-header"><Target size={12} /> SCHEDULED TASKS</div>
                    <div className="sched-card-body">
                      {result.plan_details.map((task, i) => {
                        const fs = result.feasibility_scores?.[i];
                        return (
                          <div key={i} className="sched-task-item">
                            <span className="sched-task-idx">{String(i + 1).padStart(2, '0')}</span>
                            <div className="sched-task-info">
                              <span className="sched-task-action">{task.action}</span>
                              <span className="sched-task-time">{formatTime(task.start_time)} → {formatTime(task.end_time)}</span>
                            </div>
                            <div className="sched-task-costs">
                              <span style={{ color: '#5eead4' }}>{task.power_cost_wh?.toFixed(1)} Wh</span>
                              <span style={{ color: '#a855f7' }}>{task.data_cost_gb?.toFixed(1)} Gb</span>
                            </div>
                            {fs && (
                              <span className={`sched-task-risk ${fs.risk_level?.toLowerCase()}`}>
                                {Math.round(fs.feasibility_score * 100)}% {fs.risk_level}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* RIGHT: Telecommand Sequence */}
        <div className="schedule-col schedule-command-col">
          <div className="schedule-col-header"><ChevronRight size={13} /> Telecommand Sequence</div>
          <div className="schedule-col-body">
            {!commandSeq ? (
              <div className="sched-empty" style={{ paddingTop: 40, textAlign: 'center' }}>
                <Send size={24} style={{ color: '#333' }} />
                <div style={{ color: '#444', marginTop: 8 }}>Generate a plan to see commands</div>
              </div>
            ) : (
              <>
                <div className="command-seq-header">
                  <div className="command-seq-id">{commandSeq.sequence_id}</div>
                  <div className={`command-seq-status ${commandSeq.status.toLowerCase()}`}>{commandSeq.status}</div>
                </div>
                <div className="command-list">
                  {commandSeq.commands.map((cmd, i) => (
                    <div className="command-card" key={i}>
                      <div className="command-index">{String(i + 1).padStart(2, '0')}</div>
                      <div className="command-info">
                        <div className="command-name">{cmd.command}</div>
                        {cmd.parameters && Object.keys(cmd.parameters).length > 0 && (
                          <div className="command-params">
                            {Object.entries(cmd.parameters).map(([k, v]) => (
                              <span key={k} className="command-param">{k}: {typeof v === 'number' ? v.toFixed(2) : String(v)}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="command-delay">+{cmd.delay_sec}s</div>
                    </div>
                  ))}
                </div>
                {commandSeq.status === 'PENDING' && (
                  <div style={{ padding: '8px 0' }}>
                    <button className="btn btn-primary" onClick={handleApprove} disabled={approving}>
                      {approving ? <><span className="spinner" /> Approving...</> : <><CheckCircle size={14} /> Approve Sequence</>}
                    </button>
                  </div>
                )}
                {commandSeq.status === 'APPROVED' && (
                  <div className="command-approved-badge"><CheckCircle size={12} /> Approved by {commandSeq.approved_by || 'OPERATOR'}</div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
