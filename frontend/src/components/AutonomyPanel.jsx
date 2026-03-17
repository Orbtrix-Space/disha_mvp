import { useState, useEffect } from 'react';
import { Shield, AlertTriangle, CheckCircle } from 'lucide-react';
import { api } from '../services/api';

const MODE_COLORS = {
  AUTONOMOUS: '#5eead4',
  GUARDED: '#eab308',
  SAFE: '#ef4444',
};

export default function AutonomyPanel() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await api.getAutonomyStatus();
        setStatus(data);
      } catch (e) { /* silent */ }
    };
    fetch();
    const interval = setInterval(fetch, 3000);
    return () => clearInterval(interval);
  }, []);

  if (!status) return null;

  const mode = status.mode || 'AUTONOMOUS';
  const color = MODE_COLORS[mode] || '#5eead4';
  const confidence = Math.round((status.confidence || 1) * 100);
  const Icon = mode === 'SAFE' ? AlertTriangle : mode === 'GUARDED' ? Shield : CheckCircle;

  return (
    <div className="panel-section" style={{ borderLeft: `3px solid ${color}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Icon size={16} color={color} />
        <span className="label" style={{ color, fontWeight: 700, fontSize: 13 }}>{mode}</span>
        <span className="label" style={{ marginLeft: 'auto', color: '#888', fontSize: 11 }}>
          {confidence}% confidence
        </span>
      </div>
      <div className="label" style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>
        Objective: <span style={{ color: '#e2e8f0' }}>{status.current_objective}</span>
      </div>
      <div className="label" style={{ fontSize: 10, color: '#666' }}>
        {status.last_decision}
      </div>
      {status.override_active && (
        <div style={{ marginTop: 6, fontSize: 10, color: '#f97316', fontWeight: 600 }}>
          OPERATOR OVERRIDE ACTIVE
        </div>
      )}
    </div>
  );
}
