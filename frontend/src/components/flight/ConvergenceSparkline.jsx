import { useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
} from 'recharts';

/*
 * ConvergenceSparkline — RMS residual (m) per Gauss-Newton iteration.
 *
 * Tiny inline plot meant to live alongside the OD KV grid. Log Y axis
 * (the first iteration is usually orders of magnitude larger than the
 * converged RMS) so the convergence pattern is legible.
 */

export default function ConvergenceSparkline({ history = [] }) {
  const data = useMemo(
    () => history.map((v, i) => ({ iter: i + 1, rms: Math.max(v, 1e-6) })),
    [history],
  );

  if (data.length < 2) {
    return <div className="spark-empty mono">No history</div>;
  }

  const last = history[history.length - 1];
  const first = history[0];

  return (
    <div className="spark-wrap" title={`RMS per iteration (m)`}>
      <div className="spark-canvas">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}
                     margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <XAxis dataKey="iter" hide />
            <YAxis hide scale="log" domain={['auto', 'auto']} />
            <Tooltip contentStyle={{
              background: '#16161a', border: '1px solid #2a2a30',
              fontSize: 10, color: '#e1e1e6',
            }}
              formatter={(v) => [`${Number(v).toFixed(3)} m`, 'RMS']}
              labelFormatter={(l) => `iter ${l}`} />
            <Line type="monotone" dataKey="rms" stroke="#6b8fb5"
                  strokeWidth={1.5} dot={{ r: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="spark-meta mono">
        {first.toFixed(1)} → {last.toFixed(2)} m · {history.length} iter
      </div>
    </div>
  );
}
