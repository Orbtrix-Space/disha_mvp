/**
 * DISHA — Autonomy Core Panel (Center Panel for Control Dashboard)
 *
 * Three stacked sections:
 *   A. Autonomy Status Card — mode, objective, decision, triggers, confidence
 *   B. Next Action Timeline — upcoming actions with time offsets
 *   C. Rejected Actions — infeasible/rejected objectives with reasons
 *
 * Data from /intelligence/autonomy + /intelligence/constraints
 * Polls every 2s. No scroll — fits available height.
 */

import { useState, useEffect, useRef, useMemo, memo } from 'react';
import {
  Brain, Target, Clock, XCircle, Shield, AlertTriangle,
  ArrowRight, Lock, Camera, Activity, Battery, Wifi, Sun,
} from 'lucide-react';
import { api } from '../services/api';

const MODE_COLORS = { AUTONOMOUS: '#5eead4', GUARDED: '#14b8a6', SAFE: '#ef4444' };
const MODE_BG = {
  AUTONOMOUS: 'rgba(94,234,212,0.06)',
  GUARDED: 'rgba(20,184,166,0.06)',
  SAFE: 'rgba(239,68,68,0.06)',
};
const CONF_COLORS = { HIGH: '#5eead4', MEDIUM: '#14b8a6', LOW: '#ef4444' };
const PRIORITY_COLORS = { CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#eab308', LOW: '#5eead4' };

/* ══════════════════════════════════════════════════════════════
   Section A — Autonomy Status Card
   ══════════════════════════════════════════════════════════════ */
const AutonomyStatusCard = memo(function AutonomyStatusCard({ autonomy, constraints }) {
  const mode = autonomy?.mode || 'AUTONOMOUS';
  const modeColor = MODE_COLORS[mode];
  const modeBg = MODE_BG[mode];
  const objective = autonomy?.current_objective || 'Nominal Orbit Maintenance';
  const confLevel = autonomy?.confidence_level || 'HIGH';
  const riskPct = Math.round((autonomy?.risk_score || 0) * 100);
  const riskColor = riskPct > 60 ? '#ef4444' : riskPct > 30 ? '#eab308' : '#5eead4';

  const decision = autonomy?.last_decision;
  const isStructured = typeof decision === 'object' && decision?.action;
  const decisionText = isStructured
    ? decision.reason || 'System nominal'
    : (typeof decision === 'string' ? decision : 'System nominal');

  const triggers = isStructured ? (decision.trigger_constraints || []) : [];
  const violations = constraints?.violations || [];
  const displayTriggers = triggers.length > 0 ? triggers : violations;

  const overrideInfo = autonomy?.override_info;
  const pendingTransition = autonomy?.pending_transition;

  return (
    <div className="ap-card ap-status" style={{ borderLeftColor: modeColor }}>
      {/* Mode row */}
      <div className="ap-mode-row">
        <div className="ap-mode-badge" style={{ borderColor: modeColor, color: modeColor, background: modeBg }}>
          <span className="ap-mode-dot" style={{ background: modeColor }} />
          {mode}
        </div>
        <span className="ap-conf" style={{ color: CONF_COLORS[confLevel] }}>
          <Shield size={9} /> {confLevel}
        </span>
        <span className="ap-risk" style={{ color: riskColor }}>RISK {riskPct}%</span>
        {pendingTransition && (
          <span className="ap-pending">
            <Clock size={8} /> {pendingTransition.target_mode} in {Math.max(0, pendingTransition.required_sec - pendingTransition.elapsed_sec)}s
          </span>
        )}
      </div>

      {/* Risk bar */}
      <div className="ap-risk-track">
        <div className="ap-risk-fill" style={{ width: `${riskPct}%`, background: riskColor }} />
      </div>

      {/* Objective */}
      <div className="ap-objective">
        <Target size={10} style={{ color: modeColor, flexShrink: 0 }} />
        <span>{objective}</span>
      </div>

      {/* Decision */}
      <div className="ap-decision-text">{decisionText}</div>

      {/* Triggered constraints */}
      {displayTriggers.length > 0 && (
        <div className="ap-triggers">
          <span className="ap-triggers-label">Triggered by:</span>
          {displayTriggers.slice(0, 3).map((t, i) => (
            <div key={i} className="ap-trigger-item">
              <AlertTriangle size={8} />
              <span>{t.parameter || t.message}
                {t.operator && ` ${t.operator === 'neq' ? '≠' : t.operator === 'lt' ? '<' : t.operator === 'gt' ? '>' : t.operator} ${t.threshold}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Override banner */}
      {overrideInfo?.active && (
        <div className="ap-override">
          <Lock size={9} />
          <span>OVERRIDE: {overrideInfo.forced_mode} by {overrideInfo.operator}</span>
          {overrideInfo.duration_sec != null && <span>{Math.round(overrideInfo.duration_sec)}s</span>}
        </div>
      )}

      {/* Decision meta — priority + expected outcome */}
      {isStructured && (
        <div className="ap-decision-meta">
          <span className="ap-decision-priority" style={{ color: PRIORITY_COLORS[decision.priority] }}>
            {decision.priority}
          </span>
          {decision.expected_outcome && (
            <span className="ap-decision-outcome">
              <ArrowRight size={8} /> {decision.expected_outcome}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

/* ══════════════════════════════════════════════════════════════
   Section B — Next Action Timeline
   ══════════════════════════════════════════════════════════════ */
const NextActionTimeline = memo(function NextActionTimeline({ autonomy }) {
  const actions = useMemo(() => {
    const items = [];
    const temporal = autonomy?.temporal_context || {};
    const objective = autonomy?.current_objective || '';

    if (objective.includes('Power Recovery')) {
      items.push({ time: 'NOW', action: 'Reduce non-essential loads', type: 'active' });
      items.push({ time: '+02:00', action: 'Monitor SOC recovery', type: 'pending' });
      items.push({ time: '+05:00', action: 'Resume nominal ops', type: 'pending' });
    } else if (objective.includes('Communication')) {
      items.push({ time: 'NOW', action: 'Repoint antenna / await contact', type: 'active' });
      items.push({ time: '+01:00', action: 'Acquire ground station', type: 'pending' });
      items.push({ time: '+03:00', action: 'Begin queued downlink', type: 'pending' });
    } else if (objective.includes('Data Offload')) {
      items.push({ time: 'NOW', action: 'Prioritize downlink', type: 'active' });
      items.push({ time: '+02:00', action: 'Clear storage buffer', type: 'pending' });
      items.push({ time: '+04:00', action: 'Resume imaging tasks', type: 'pending' });
    } else if (objective.includes('Eclipse')) {
      items.push({ time: 'NOW', action: 'Enter power conservation', type: 'active' });
      items.push({ time: '+05:00', action: 'Eclipse exit (predicted)', type: 'pending' });
      items.push({ time: '+06:00', action: 'Resume solar charging', type: 'pending' });
    } else if (objective.includes('Target')) {
      items.push({ time: 'NOW', action: 'Align for scheduled task', type: 'active' });
      items.push({ time: '+01:00', action: 'Execute imaging pass', type: 'pending' });
      items.push({ time: '+03:00', action: 'Return to nominal', type: 'pending' });
    } else {
      items.push({ time: 'NOW', action: 'Nominal orbit maintenance', type: 'active' });
      if (temporal.contact_imminent) {
        items.push({ time: '+02:00', action: 'Prepare for ground contact', type: 'pending' });
      }
      if (temporal.eclipse_imminent) {
        items.push({ time: '+05:00', action: 'Eclipse entry prep', type: 'pending' });
      }
      if (items.length === 1) {
        items.push({ time: '+05:00', action: 'Continue orbit propagation', type: 'pending' });
        items.push({ time: '+10:00', action: 'Next contact window', type: 'pending' });
      }
    }
    return items.slice(0, 4);
  }, [autonomy?.current_objective, autonomy?.temporal_context]);

  return (
    <div className="ap-card ap-timeline">
      <div className="ap-card-header">
        <Clock size={11} />
        <span>NEXT ACTIONS</span>
      </div>
      <div className="ap-timeline-list">
        {actions.map((a, i) => (
          <div key={i} className={`ap-tl-item ${a.type}`}>
            <div className="ap-tl-dot" />
            {i < actions.length - 1 && <div className="ap-tl-line" />}
            <span className="ap-tl-time">{a.time}</span>
            <span className="ap-tl-action">{a.action}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

/* ══════════════════════════════════════════════════════════════
   Section C — Rejected Actions
   ══════════════════════════════════════════════════════════════ */
const RejectedActions = memo(function RejectedActions({ autonomy }) {
  const rejected = useMemo(() => {
    const dec = autonomy?.last_decision;
    if (typeof dec === 'object' && dec?.rejected_objectives?.length > 0) {
      return dec.rejected_objectives.slice(0, 3);
    }
    // Derive from feasibility
    const feasibility = autonomy?.feasibility || {};
    const items = [];
    const TASK_MAP = {
      power: 'Imaging Task', communication: 'High Rate Downlink',
      storage: 'Data Collection', attitude: 'Precision Pointing',
      power_margin: 'Payload Activation',
    };
    for (const [key, val] of Object.entries(feasibility)) {
      if (val && !val.feasible && val.reason) {
        items.push({ objective: TASK_MAP[key] || key, reason: val.reason });
      }
    }
    return items.slice(0, 3);
  }, [autonomy?.last_decision, autonomy?.feasibility]);

  return (
    <div className="ap-card ap-rejected">
      <div className="ap-card-header">
        <XCircle size={11} />
        <span>REJECTED ACTIONS</span>
        <span className="ap-rejected-count">{rejected.length}</span>
      </div>
      {rejected.length === 0 ? (
        <div className="ap-rejected-empty">All actions feasible</div>
      ) : (
        rejected.map((r, i) => (
          <div key={i} className="ap-rej-item">
            <XCircle size={9} className="ap-rej-icon" />
            <div className="ap-rej-content">
              <span className="ap-rej-name">{r.objective}</span>
              <span className="ap-rej-reason">{r.reason}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
});

/* ══════════════════════════════════════════════════════════════
   Section D — Upcoming Tasks (from Schedule)
   ══════════════════════════════════════════════════════════════ */
const UpcomingTasks = memo(function UpcomingTasks() {
  const [sequences, setSequences] = useState(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const data = await api.getCommandSequences();
      if (mounted && data) setSequences(data);
    };
    load();
    const id = setInterval(load, 5000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const tasks = useMemo(() => {
    if (!sequences) return [];
    const items = [];
    const seqList = Array.isArray(sequences) ? sequences : (sequences.sequences || []);
    for (const seq of seqList) {
      if (!seq.commands) continue;
      for (const cmd of seq.commands) {
        if (cmd.command && (cmd.command.includes('IMAGING') || cmd.command.includes('PAYLOAD') || cmd.command.includes('DOWNLINK'))) {
          items.push({
            task: cmd.command.replace(/_/g, ' '),
            desc: cmd.description || cmd.command,
            status: seq.approved ? 'APPROVED' : 'PENDING',
            time: cmd.scheduled_time,
          });
        }
      }
    }
    return items.slice(0, 3);
  }, [sequences]);

  if (!tasks.length) {
    return (
      <div className="ap-card ap-tasks">
        <div className="ap-card-header">
          <Camera size={11} />
          <span>UPCOMING TASKS</span>
        </div>
        <div className="ap-tasks-empty">No scheduled tasks</div>
      </div>
    );
  }

  return (
    <div className="ap-card ap-tasks">
      <div className="ap-card-header">
        <Camera size={11} />
        <span>UPCOMING TASKS</span>
        <span className="ap-tasks-count">{tasks.length}</span>
      </div>
      {tasks.map((t, i) => (
        <div key={i} className="ap-task-item">
          <div className="ap-task-name">{t.desc}</div>
          <span className={`ap-task-status ${t.status === 'APPROVED' ? 'approved' : 'pending'}`}>
            {t.status}
          </span>
        </div>
      ))}
    </div>
  );
});

/* ══════════════════════════════════════════════════════════════
   Section E — Telemetry Insights (compact sparkline trends)
   ══════════════════════════════════════════════════════════════ */
const HISTORY_MAX = 90;

function InsightSparkline({ data, color, width = '100%', height = 40, warn, crit }) {
  if (!data || data.length < 2) {
    return <div className="ti-spark-empty" style={{ height }} />;
  }
  const svgW = 200;
  let min = Math.min(...data);
  let max = Math.max(...data);
  if (warn != null && warn < min) min = warn - 1;
  if (crit != null && crit < min) min = crit - 1;
  if (warn != null && warn > max) max = warn + 1;
  if (crit != null && crit > max) max = crit + 1;
  const range = max - min || 1;
  const toY = (v) => height - 2 - ((v - min) / range) * (height - 4);

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * svgW;
    return `${x},${toY(v)}`;
  }).join(' ');

  // Gradient fill
  const fillPoints = `0,${height} ${points} ${svgW},${height}`;

  return (
    <svg viewBox={`0 0 ${svgW} ${height}`} width={width} height={height} preserveAspectRatio="none" className="ti-spark-svg">
      {/* Threshold lines */}
      {warn != null && (
        <line x1="0" y1={toY(warn)} x2={svgW} y2={toY(warn)}
          stroke="#eab308" strokeWidth="0.8" strokeDasharray="4,4" opacity="0.4" />
      )}
      {crit != null && (
        <line x1="0" y1={toY(crit)} x2={svgW} y2={toY(crit)}
          stroke="#ef4444" strokeWidth="0.8" strokeDasharray="4,4" opacity="0.4" />
      )}
      {/* Fill area */}
      <polygon points={fillPoints} fill={color} opacity="0.06" />
      {/* Line */}
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      {/* Current value dot */}
      <circle cx={svgW} cy={toY(data[data.length - 1])} r="2.5" fill={color} />
    </svg>
  );
}

const TelemetryInsights = memo(function TelemetryInsights({ telemetry }) {
  const histRef = useRef({ battery: [], snr: [], solar: [] });

  useEffect(() => {
    if (!telemetry) return;
    const h = histRef.current;
    const push = (arr, val) => { if (val == null) return; arr.push(val); if (arr.length > HISTORY_MAX) arr.shift(); };
    push(h.battery, telemetry.battery_pct);
    push(h.snr, telemetry.snr_db);
    push(h.solar, telemetry.solar_panel_current_a);
  }, [telemetry]);

  if (!telemetry) return null;

  const battColor = telemetry.battery_pct > 40 ? '#5eead4' : telemetry.battery_pct > 20 ? '#eab308' : '#ef4444';
  const snrColor = telemetry.snr_db > 8 ? '#5eead4' : telemetry.snr_db > 5 ? '#eab308' : '#ef4444';

  return (
    <div className="ap-card ap-insights">
      <div className="ap-card-header">
        <Activity size={11} />
        <span>TELEMETRY INSIGHTS</span>
      </div>
      <div className="ti-grid">
        {/* Battery Trend */}
        <div className="ti-panel">
          <div className="ti-panel-top">
            <div className="ti-panel-label"><Battery size={9} /> Battery</div>
            <div className="ti-panel-value" style={{ color: battColor }}>
              {telemetry.battery_pct}%
            </div>
          </div>
          <InsightSparkline
            data={histRef.current.battery}
            color={battColor}
            height={36}
            warn={40}
            crit={20}
          />
        </div>

        {/* Link Quality / SNR */}
        <div className="ti-panel">
          <div className="ti-panel-top">
            <div className="ti-panel-label"><Wifi size={9} /> SNR</div>
            <div className="ti-panel-value" style={{ color: snrColor }}>
              {telemetry.snr_db} dB
            </div>
          </div>
          <InsightSparkline
            data={histRef.current.snr}
            color={snrColor}
            height={36}
            warn={8}
            crit={5}
          />
        </div>

        {/* Solar Current */}
        <div className="ti-panel">
          <div className="ti-panel-top">
            <div className="ti-panel-label"><Sun size={9} /> Solar</div>
            <div className="ti-panel-value" style={{ color: '#f59e0b' }}>
              {telemetry.solar_panel_current_a} A
            </div>
          </div>
          <InsightSparkline
            data={histRef.current.solar}
            color="#f59e0b"
            height={36}
          />
        </div>
      </div>
    </div>
  );
});

/* ══════════════════════════════════════════════════════════════
   Main Autonomy Panel
   ══════════════════════════════════════════════════════════════ */
export default function AutonomyPanel({ telemetry }) {
  const [autonomy, setAutonomy] = useState(null);
  const [constraints, setConstraints] = useState(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [a, c] = await Promise.all([
        api.getAutonomyStatus(),
        api.getConstraints(),
      ]);
      if (!mounted) return;
      if (a) setAutonomy(a);
      if (c) setConstraints(c);
    };
    load();
    const id = setInterval(load, 2000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  if (!autonomy) {
    return (
      <div className="autonomy-panel ap-loading">
        <Brain size={18} style={{ color: '#333' }} />
        <span>Awaiting autonomy data...</span>
      </div>
    );
  }

  return (
    <div className="autonomy-panel">
      <AutonomyStatusCard autonomy={autonomy} constraints={constraints} />
      <TelemetryInsights telemetry={telemetry} />
      <NextActionTimeline autonomy={autonomy} />
      <RejectedActions autonomy={autonomy} />
      <UpcomingTasks />
    </div>
  );
}
