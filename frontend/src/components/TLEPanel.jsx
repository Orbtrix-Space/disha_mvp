import { useState, useEffect } from 'react';
import { Radio, Search, Download, CheckCircle, XCircle } from 'lucide-react';
import { api } from '../services/api';

const QUICK_SATS = [
  { name: 'ISS (ZARYA)', norad: 25544 },
  { name: 'Hubble', norad: 20580 },
  { name: 'NOAA 19', norad: 33591 },
  { name: 'TERRA', norad: 25994 },
  { name: 'AQUA', norad: 27424 },
  { name: 'Landsat 9', norad: 49260 },
];

export default function TLEPanel() {
  const [noradId, setNoradId] = useState('');
  const [loading, setLoading] = useState(false);
  const [tleInfo, setTleInfo] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    api.getCurrentTLE().then((data) => {
      if (data && data.loaded) setTleInfo(data);
    });
  }, []);

  const loadTLE = async (id) => {
    setLoading(true);
    setMessage(null);

    const result = await api.loadTLE(id);
    setLoading(false);

    if (result && result.status === 'SUCCESS') {
      setTleInfo(result.tle);
      setMessage({ type: 'success', text: `Loaded TLE for ${result.tle.satellite_name}` });
    } else {
      setMessage({
        type: 'error',
        text: result?.message || 'Failed to load TLE',
      });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const id = parseInt(noradId, 10);
    if (!isNaN(id) && id > 0) {
      loadTLE(id);
    }
  };

  return (
    <div className="tle-panel">
      <div className="tle-content">
        {/* Header */}
        <div className="section-title" style={{ marginBottom: 24 }}>
          <Radio size={14} /> TLE Management
        </div>

        {/* Search form */}
        <form onSubmit={handleSubmit} className="tle-search-form">
          <div className="form-group">
            <label className="form-label">NORAD Catalog ID</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="form-input"
                type="number"
                placeholder="e.g. 25544"
                value={noradId}
                onChange={(e) => setNoradId(e.target.value)}
                min={1}
              />
              <button
                className="btn btn-primary"
                type="submit"
                disabled={!noradId || loading}
                style={{ width: 'auto', padding: '10px 20px', whiteSpace: 'nowrap' }}
              >
                {loading ? (
                  <span className="spinner" />
                ) : (
                  <>
                    <Download size={14} /> Fetch
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {/* Quick select */}
        <div className="form-group">
          <label className="form-label">Quick Select</label>
          <div className="quick-select-grid">
            {QUICK_SATS.map((sat) => (
              <button
                key={sat.norad}
                className="quick-city-btn"
                onClick={() => loadTLE(sat.norad)}
                disabled={loading}
              >
                <Radio size={12} />
                {sat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Status message */}
        {message && (
          <div
            className={`tle-message ${message.type}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.8rem',
              marginBottom: 20,
              background: message.type === 'success'
                ? 'rgba(34, 197, 94, 0.1)'
                : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${message.type === 'success'
                ? 'rgba(34, 197, 94, 0.3)'
                : 'rgba(239, 68, 68, 0.3)'}`,
              color: message.type === 'success'
                ? 'var(--accent-green)'
                : 'var(--accent-red)',
            }}
          >
            {message.type === 'success' ? <CheckCircle size={14} /> : <XCircle size={14} />}
            {message.text}
          </div>
        )}

        {/* Current TLE display */}
        {tleInfo && tleInfo.loaded && (
          <div className="tle-display">
            <div className="section-title" style={{ marginBottom: 16 }}>
              <CheckCircle size={12} style={{ color: 'var(--accent-green)' }} />
              Active TLE
            </div>
            <div className="tle-field">
              <span className="tle-field-label">Satellite</span>
              <span className="tle-field-value">{tleInfo.satellite_name}</span>
            </div>
            <div className="tle-field">
              <span className="tle-field-label">NORAD ID</span>
              <span className="tle-field-value">{tleInfo.norad_id}</span>
            </div>
            <div className="tle-lines">
              <div className="tle-line">{tleInfo.tle_line1}</div>
              <div className="tle-line">{tleInfo.tle_line2}</div>
            </div>
          </div>
        )}

        {!tleInfo?.loaded && (
          <div className="empty-state" style={{ paddingTop: 40 }}>
            <Radio size={48} />
            <div className="empty-state-title">No TLE Loaded</div>
            <div className="empty-state-desc">
              Enter a NORAD ID or use quick select to fetch a TLE from CelesTrak.
              The satellite will switch to SGP4 propagation automatically.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
