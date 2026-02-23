import { useState, useEffect } from 'react';
import { AlertTriangle, ShieldAlert, Activity, Shield, Clock, CheckCircle } from 'lucide-react';
import { api } from '../services/api';

const SEVERITY_CONFIG = {
  CRITICAL: { color: 'var(--accent-red)', bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.3)' },
  WARNING: { color: 'var(--accent-yellow)', bg: 'rgba(234, 179, 8, 0.08)', border: 'rgba(234, 179, 8, 0.3)' },
};

export default function FDIRPanel({ alerts }) {
  const [filter, setFilter] = useState('all');
  const [fdirSummary, setFdirSummary] = useState(null);

  useEffect(() => {
    const fetch = () => {
      api.getFDIRSummary().then((data) => {
        if (data) setFdirSummary(data);
      });
    };
    fetch();
    const id = setInterval(fetch, 5000);
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

        {/* FDIR Summary Bar */}
        {fdirSummary && (
          <div className="fdir-summary-bar">
            <div className="fdir-summary-card">
              <div className="fdir-summary-label">Rules Active</div>
              <div className="fdir-summary-value" style={{ color: 'var(--accent-cyan)' }}>
                {fdirSummary.rules_active}
              </div>
            </div>
            <div className="fdir-summary-card">
              <div className="fdir-summary-label">Last Check</div>
              <div className="fdir-summary-value" style={{ color: 'var(--text-secondary)' }}>
                <Clock size={10} style={{ display: 'inline', marginRight: 3 }} />
                {fdirSummary.last_evaluation_time}
              </div>
            </div>
            <div className="fdir-summary-card">
              <div className="fdir-summary-label">Risk Score</div>
              <div className="fdir-summary-value" style={{
                color: fdirSummary.status === 'NOMINAL' ? 'var(--accent-green)'
                  : fdirSummary.status === 'CRITICAL' ? 'var(--accent-red)'
                  : 'var(--accent-yellow)',
              }}>
                {fdirSummary.status}
              </div>
            </div>
            <div className="fdir-summary-card">
              <div className="fdir-summary-label">Auto Actions</div>
              <div className="fdir-summary-value" style={{ color: 'var(--accent-purple)' }}>
                {fdirSummary.auto_actions_today}
              </div>
            </div>
          </div>
        )}

        {/* Status counts */}
        <div className="fdir-status-bar">
          <div className="fdir-status-item">
            <Activity size={10} />
            <span>Engine: ACTIVE</span>
          </div>
          <div className="fdir-status-item">
            <AlertTriangle size={10} />
            <span>{critCount} Critical / {warnCount} Warning</span>
          </div>
          <div className="fdir-status-item">
            <span>Total: {fdirSummary?.total_alerts || 0}</span>
          </div>
        </div>

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
          <div className="fdir-nominal-state">
            <div className="fdir-nominal-icon">
              <CheckCircle size={48} />
            </div>
            <div className="fdir-nominal-title">System Nominal</div>
            <div className="fdir-nominal-desc">
              All rules within threshold. FDIR engine monitoring {fdirSummary?.rules_active || 7} constraint rules at 1 Hz.
            </div>
            {fdirSummary && (
              <div className="fdir-nominal-stats">
                <span>Last evaluation: {fdirSummary.last_evaluation_time}</span>
                <span>Auto actions today: {fdirSummary.auto_actions_today}</span>
              </div>
            )}
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
                {alert.corrective_action && (
                  <div className="fdir-alert-action">
                    <span style={{ color: 'var(--accent-cyan)', fontSize: '0.6rem', fontWeight: 600 }}>
                      RECOMMENDED ACTION:
                    </span>
                    <span>{alert.corrective_action}</span>
                  </div>
                )}
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
