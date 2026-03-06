import { useState, useEffect } from 'react';
import { ShieldAlert } from 'lucide-react';
import { api } from '../services/api';

export default function ConstraintPanel() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const result = await api.getConstraints();
        setData(result);
      } catch (e) { /* silent */ }
    };
    fetch();
    const interval = setInterval(fetch, 3000);
    return () => clearInterval(interval);
  }, []);

  if (!data) return null;

  const riskPct = Math.round((data.risk_score || 0) * 100);
  const riskColor = riskPct > 60 ? '#ef4444' : riskPct > 30 ? '#eab308' : '#22c55e';

  return (
    <div className="panel-section">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <ShieldAlert size={14} color={riskColor} />
        <span className="label" style={{ fontSize: 11, color: '#888' }}>RISK SCORE</span>
        <span style={{ marginLeft: 'auto', color: riskColor, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', fontSize: 14 }}>
          {riskPct}%
        </span>
      </div>
      <div style={{ width: '100%', height: 4, background: '#1a1a1a', borderRadius: 2, marginBottom: 8 }}>
        <div style={{ width: `${riskPct}%`, height: '100%', background: riskColor, borderRadius: 2, transition: 'width 0.3s' }} />
      </div>
      {data.active_constraints && data.active_constraints.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.active_constraints.map((c, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: c.severity === 'CRITICAL' ? '#ef4444' : '#eab308' }}>
              <span>{c.message || c.type}</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{c.weight}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
