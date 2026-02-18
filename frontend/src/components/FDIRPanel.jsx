import { useState, useEffect } from 'react';
import { AlertTriangle, ShieldAlert, Filter, Activity, Cpu } from 'lucide-react';
import { api } from '../services/api';

const SEVERITY_CONFIG = {
  CRITICAL: { color: 'var(--accent-red)', bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.3)' },
  WARNING: { color: 'var(--accent-yellow)', bg: 'rgba(234, 179, 8, 0.08)', border: 'rgba(234, 179, 8, 0.3)' },
};

export default function FDIRPanel({ alerts }) {
  const [filter, setFilter] = useState('all');
  const [fdirStatus, setFdirStatus] = useState(null);

  useEffect(() => {
    api.getFDIRStatus().then((data) => {
      if (data) setFdirStatus(data);
    });
    const id = setInterval(() => {
      api.getFDIRStatus().then((data) => {
        if (data) setFdirStatus(data);
      });
    }, 10000);
    return () => clearInterval(id);
  }, []);

  const filtered = filter === 'all'
    ? alerts
    : alerts.filter((a) => a.severity === filter.toUpperCase());

  const critCount = alerts.filter((a) => a.severity === 'CRITICAL').length;
  const warnCount = alerts.filter((a) => a.severity === 'WARNING').length;

  return (
    <div className="fdir-panel">
      {/* Header */}
      <div className="fdir-header">
        <div className="section-title" style={{ marginBottom: 12 }}>
          <ShieldAlert size={14} /> Event Management
        </div>

        {/* Status bar */}
        {fdirStatus && (
          <div className="fdir-status-bar">
            <div className="fdir-status-item">
              <Activity size={10} />
              <span>Rules: {fdirStatus.rules_enabled ? 'ON' : 'OFF'}</span>
            </div>
            <div className="fdir-status-item">
              <Cpu size={10} />
              <span>ML: {fdirStatus.ml_trained ? 'Trained' : `Learning (${fdirStatus.samples_collected}/60)`}</span>
            </div>
            <div className="fdir-status-item">
              <AlertTriangle size={10} />
              <span>{critCount} Critical / {warnCount} Warning</span>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="fdir-filters">
          {['all', 'critical', 'warning'].map((f) => (
            <button
              key={f}
              className={`fdir-filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? `All (${alerts.length})` :
               f === 'critical' ? `Critical (${critCount})` :
               `Warning (${warnCount})`}
            </button>
          ))}
        </div>
      </div>

      {/* Alert list */}
      <div className="fdir-list">
        {filtered.length === 0 ? (
          <div className="empty-state" style={{ paddingTop: 80 }}>
            <ShieldAlert size={48} />
            <div className="empty-state-title">No Events</div>
            <div className="empty-state-desc">
              Event management engine is monitoring telemetry. Anomalies and alerts will appear here.
            </div>
          </div>
        ) : (
          filtered.map((alert, i) => {
            const cfg = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.WARNING;
            return (
              <div
                key={alert.alert_id + i}
                className="fdir-alert-card"
                style={{
                  borderLeftColor: cfg.color,
                  background: cfg.bg,
                }}
              >
                <div className="fdir-alert-header">
                  <span className="fdir-alert-severity" style={{ color: cfg.color }}>
                    <AlertTriangle size={12} />
                    {alert.severity}
                  </span>
                  <span className="fdir-alert-code">{alert.code}</span>
                </div>
                <div className="fdir-alert-message">{alert.message}</div>
                <div className="fdir-alert-time">
                  {new Date(alert.timestamp).toLocaleTimeString()}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
