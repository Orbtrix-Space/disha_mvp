import { useState, useEffect } from 'react';
import { Battery, Sun, Moon } from 'lucide-react';
import { api } from '../services/api';

export default function PowerPanel() {
  const [projection, setProjection] = useState(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await api.getPowerProjection();
        setProjection(data);
      } catch (e) { /* silent */ }
    };
    fetch();
    const interval = setInterval(fetch, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!projection) return null;

  const ModeIcon = projection.current_mode === 'ECLIPSE' ? Moon : Sun;
  const modeColor = projection.current_mode === 'ECLIPSE' ? '#a855f7' : '#eab308';

  return (
    <div className="panel-section">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Battery size={14} color="#22c55e" />
        <span className="label" style={{ fontSize: 11, color: '#888' }}>POWER PROJECTION</span>
        <ModeIcon size={12} color={modeColor} style={{ marginLeft: 'auto' }} />
        <span style={{ fontSize: 10, color: modeColor }}>{projection.current_mode}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 }}>
        <div>
          <span className="label" style={{ color: '#666', fontSize: 9 }}>AT ECLIPSE</span>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', color: '#e2e8f0' }}>
            {projection.projected_next_eclipse}%
          </div>
        </div>
        <div>
          <span className="label" style={{ color: '#666', fontSize: 9 }}>AT ORBIT END</span>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', color: '#e2e8f0' }}>
            {projection.projected_next_orbit}%
          </div>
        </div>
        <div>
          <span className="label" style={{ color: '#666', fontSize: 9 }}>NEXT ECLIPSE</span>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', color: '#e2e8f0' }}>
            {projection.time_to_next_eclipse_min} min
          </div>
        </div>
        <div>
          <span className="label" style={{ color: '#666', fontSize: 9 }}>CURRENT</span>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', color: '#e2e8f0' }}>
            {projection.current_battery}%
          </div>
        </div>
      </div>
      {projection.power_warning && (
        <div style={{ marginTop: 6, fontSize: 10, color: '#ef4444', fontWeight: 600 }}>
          {projection.warning_reason}
        </div>
      )}
    </div>
  );
}
