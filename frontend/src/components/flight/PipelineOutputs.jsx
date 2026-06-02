import { useEffect, useState, useCallback } from 'react';
import { api } from '../../services/api';
import ResidualsPlot from './ResidualsPlot';
import ConvergenceSparkline from './ConvergenceSparkline';
import RangeToTCAPlot from './RangeToTCAPlot';

/*
 * PipelineOutputs — the operator surface fed by /flight/pipeline.
 *
 * Composed of three independently exported blocks:
 *   <OdBlock />            OD KV grid + residuals plot + convergence sparkline
 *   <ConjunctionBlock />   approaches table + range-vs-TCA + B-plane
 *   <ManeuverBlock />      maneuver recommendation card + event tail
 *
 * They share a single 2 s polling loop via the `useFlightRun` hook below
 * so we don't fire three independent timers.
 */

const RISK_CLASS = { red: 'risk-red', yellow: 'risk-yellow', green: 'risk-green' };

function fmt(n, d = 2) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toFixed(d);
}
function fmtPc(pc) {
  if (pc == null || pc === 0) return '<1e-200';
  if (pc < 1e-200) return '<1e-200';
  return pc.toExponential(2);
}
function timeOnly(iso) {
  if (!iso) return '—';
  return iso.slice(11, 19);
}

/* ── Shared polling hook ─────────────────────────────────────── */

export function useFlightRun(intervalMs = 2000) {
  const [run, setRun] = useState(null);
  const [events, setEvents] = useState([]);

  const refresh = useCallback(async () => {
    const r = await api.getFlightPipeline();
    if (r) {
      setRun(r.run || null);
      setEvents(r.run?.events?.slice(-12)?.reverse() || []);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
  }, [refresh, intervalMs]);

  return { run, events, refresh };
}

/* ── OD block ────────────────────────────────────────────────── */

export function OdBlock() {
  const { run } = useFlightRun();
  const od = run?.od_result;

  if (!od) {
    return (
      <div className="pl-block">
        <header className="pl-block-head">Orbit determination</header>
        <div className="pl-empty">No OD yet — paste a GPS arc and press Determine orbit.</div>
      </div>
    );
  }

  return (
    <div className="pl-block">
      <header className="pl-block-head">
        Orbit determination
        <span className="pl-block-meta mono">{od.method} · {od.elapsed_ms} ms</span>
      </header>
      <div className="pl-block-body od-body">
        <div className="od-kv">
          <div className="pl-out-grid">
            <KV k="Converged"   v={od.converged ? 'yes' : 'no'} />
            <KV k="Iterations"  v={od.iterations} />
            <KV k="N obs"       v={od.n_observations} />
            <KV k="Fit arc"     v={`${fmt(od.fit_arc_seconds, 0)} s`} />
            <KV k="RMS residual" v={`${fmt(od.rms_residual_m, 2)} m`} />
            <KV k="σ position"  v={`${fmt(od.sigma_pos_m, 2)} m`} />
            <KV k="σ velocity"  v={`${(od.sigma_vel_m_s * 1000).toFixed(2)} mm/s`} />
            <KV k="cond(P)"     v={od.covariance_condition.toExponential(2)} />
            {od.orbital_elements && (
              <>
                <KV k="a"      v={`${fmt(od.orbital_elements.semi_major_axis_km, 3)} km`} />
                <KV k="e"      v={fmt(od.orbital_elements.eccentricity, 6)} />
                <KV k="i"      v={`${fmt(od.orbital_elements.inclination_deg, 3)}°`} />
                <KV k="RAAN"   v={`${fmt(od.orbital_elements.raan_deg, 3)}°`} />
                <KV k="ω"      v={`${fmt(od.orbital_elements.arg_perigee_deg, 3)}°`} />
                <KV k="ν"      v={`${fmt(od.orbital_elements.true_anomaly_deg, 3)}°`} />
                <KV k="period" v={`${fmt(od.orbital_elements.period_minutes, 3)} min`} />
              </>
            )}
          </div>
          <div className="od-spark">
            <span className="od-spark-label mono">Convergence</span>
            <ConvergenceSparkline history={od.rms_history_m || []} />
          </div>
        </div>
        <div className="od-plot">
          <ResidualsPlot
            residuals={od.residuals || []}
            sigmaM={5}  /* TODO: pull from GPS meta when present */
            rmsM={od.rms_residual_m}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Conjunction block ───────────────────────────────────────── */

export function ConjunctionBlock() {
  const { run } = useFlightRun();
  const screen = run?.screen_result;
  const approaches = screen?.approaches || [];
  const [selectedId, setSelectedId] = useState(null);

  // Default selection: worst-Pc approach (first row, since the backend
  // sorts by -Pc already). Selecting a row emphasises its curve in the
  // range-vs-TCA plot.
  useEffect(() => {
    if (!selectedId && approaches.length) {
      setSelectedId(approaches[0].secondary_id);
    }
  }, [approaches, selectedId]);

  return (
    <div className="pl-block">
      <header className="pl-block-head">
        Conjunction screening
        {screen && (
          <span className="pl-block-meta mono">
            {screen.secondaries_screened} screened · {screen.candidates} candidates
            {' '}· {fmt(screen.elapsed_ms, 0)} ms
          </span>
        )}
      </header>
      <div className="pl-block-body cj-body">
        <div className="cj-table-wrap">
          {approaches.length ? (
            <table className="pl-table">
              <thead>
                <tr>
                  <th>Object</th>
                  <th>TCA UTC</th>
                  <th className="num">Miss</th>
                  <th className="num">Vrel</th>
                  <th className="num">σ along</th>
                  <th className="num">σ cross</th>
                  <th className="num">Pc</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {approaches.map((a) => (
                  <tr key={a.secondary_id}
                      className={a.secondary_id === selectedId ? 'selected' : ''}
                      onClick={() => setSelectedId(a.secondary_id)}>
                    <td className="mono">{a.secondary_id}</td>
                    <td className="mono">{timeOnly(a.tca)}</td>
                    <td className="num">{fmt(a.miss_distance_m, 0)} m</td>
                    <td className="num">{fmt(a.relative_velocity_m_s, 0)} m/s</td>
                    <td className="num">{fmt(a.sigma_along_track_m, 0)} m</td>
                    <td className="num">{fmt(a.sigma_cross_track_m, 0)} m</td>
                    <td className="num">{fmtPc(a.pc)}</td>
                    <td>
                      <span className={`pl-pill ${RISK_CLASS[a.risk]}`}>{a.risk}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="pl-empty">
              {screen ? 'All clear in horizon.' : 'No screen yet.'}
            </div>
          )}
        </div>
        <div className="cj-plots">
          <div className="cj-plot">
            <RangeToTCAPlot
              approaches={approaches}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Maneuver + Event tail block ─────────────────────────────── */

export function ManeuverBlock() {
  const { run, events, refresh } = useFlightRun();
  const mv = run?.maneuver;
  const [busy, setBusy] = useState(false);

  const onApprove = useCallback(async (approved) => {
    setBusy(true);
    await api.approveManeuver(approved);
    setBusy(false);
    refresh();
  }, [refresh]);

  return (
    <div className="pl-block">
      <header className="pl-block-head">Maneuver recommendation</header>
      <div className="pl-block-body mv-body">
        {mv ? (
          <>
            <div className="pl-out-grid">
              <KV k="Target"        v={`${mv.target_id} (${mv.target_name})`} />
              <KV k="TCA"           v={timeOnly(mv.tca)} />
              <KV k="Current miss"  v={`${fmt(mv.current_miss_m, 0)} m`} />
              <KV k="Current Pc"    v={fmtPc(mv.current_pc)} />
              <KV k="Burn time"     v={timeOnly(mv.burn_time)} />
              <KV k="Δv"            v={`${mv.delta_v_m_s} m/s ${mv.direction}`} />
              <KV k="Expected miss" v={`${fmt(mv.expected_miss_m, 0)} m`} />
              <KV k="Status"        v={mv.status} />
            </div>
            {mv.notes?.length > 0 && (
              <div className="pl-out-notes mono">{mv.notes.join(' · ')}</div>
            )}
            {mv.status === 'PENDING_APPROVAL' && (
              <div className="pl-out-actions">
                <button className="pl-btn pl-btn-primary" disabled={busy}
                        onClick={() => onApprove(true)}>Approve</button>
                <button className="pl-btn pl-btn-ghost" disabled={busy}
                        onClick={() => onApprove(false)}>Reject</button>
              </div>
            )}
          </>
        ) : (
          <div className="pl-empty">
            {run?.screen_result?.approaches?.length
              ? 'No maneuver recommended (worst Pc below action threshold).'
              : 'No threat to mitigate.'}
          </div>
        )}

        <div className="mv-events">
          <div className="mv-events-head">Event log</div>
          {events.length === 0 ? (
            <div className="pl-empty">No events yet.</div>
          ) : (
            <ul className="pl-events">
              {events.map((e, i) => (
                <li key={i} className={`pl-event pl-event-${e.level}`}>
                  <span className="pl-event-t mono">{timeOnly(e.t)}</span>
                  <span className="pl-event-stage">{e.stage}</span>
                  <span className="pl-event-msg">{e.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Backwards-compat default export ─────────────────────────── */

export default function PipelineOutputs() {
  return (
    <div className="pl-stack">
      <OdBlock />
      <ConjunctionBlock />
      <ManeuverBlock />
    </div>
  );
}

function KV({ k, v }) {
  return (
    <div className="pl-kv">
      <span className="pl-kv-k">{k}</span>
      <span className="pl-kv-v mono">{v}</span>
    </div>
  );
}
