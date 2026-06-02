import { useEffect, useState } from 'react';
import { api } from '../../services/api';

/*
 * PipelineStatusStrip — top of FLIGHT, console-style summary of the
 * automated ops chain. One compact pill per stage:
 *   [idx] [status-dot] [short label] [elapsed ms]
 * Short labels fit on every viewport; the strip wraps to multiple rows
 * before it ever truncates.
 */

const STATUS_CLASS = {
  queued:  'queued',
  running: 'running',
  done:    'done',
  failed:  'failed',
  skipped: 'skipped',
};

// Short, fixed labels — chosen so no stage ever ellipsises.
const SHORT_LABEL = {
  ingest:    'Ingest',
  od:        'OD',
  screen:    'Conjunction',
  assess:    'Risk',
  recommend: 'Maneuver',
};

export default function PipelineStatusStrip() {
  const [run, setRun] = useState(null);
  const [gpsMeta, setGpsMeta] = useState(null);
  const [catalogMeta, setCatalogMeta] = useState(null);

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      const r = await api.getFlightPipeline();
      if (mounted && r) {
        setRun(r.run || null);
        setGpsMeta(r.gps_meta || null);
        setCatalogMeta(r.catalog_meta || null);
      }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const stages = run?.stages || [
    { name: 'ingest',    status: 'queued' },
    { name: 'od',        status: 'queued' },
    { name: 'screen',    status: 'queued' },
    { name: 'assess',    status: 'queued' },
    { name: 'recommend', status: 'queued' },
  ];

  return (
    <div className="pl-strip">
      <div className="pl-strip-meta">
        <span className="pl-strip-label">PIPELINE</span>
        <span className="pl-strip-state">{run?.state || 'idle'}</span>
        {gpsMeta?.count > 0 && (
          <span className="pl-strip-gps">
            GPS · {gpsMeta.count} fixes · {Math.round(gpsMeta.span_seconds || 0)} s · σ {gpsMeta.sigma_m} m
          </span>
        )}
        {catalogMeta?.count > 0 ? (
          <span className="pl-strip-gps">
            Catalog · {catalogMeta.count} obj · {catalogMeta.source}
          </span>
        ) : (
          <span className="pl-strip-gps muted">Catalog · synthetic threats</span>
        )}
      </div>
      <div className="pl-strip-stages">
        {stages.map((s, i) => (
          <div key={s.name} className={`pl-stage ${STATUS_CLASS[s.status] || ''}`}>
            <span className="pl-stage-idx">{i + 1}</span>
            <span className={`pl-stage-dot pl-${s.status}`} />
            <span className="pl-stage-label">{SHORT_LABEL[s.name] || s.name}</span>
            <span className="pl-stage-meta">
              {s.elapsed_ms > 0 ? `${Math.round(s.elapsed_ms)} ms` : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
