import { useState } from 'react';
import {
  Send,
  Plus,
  X,
  MapPin,
  Crosshair,
  Zap,
  Clock,
  ChevronRight,
  Target,
  Rocket,
} from 'lucide-react';
import { api } from '../services/api';

const CITIES = [
  { name: 'Bangalore', lat: 12.9716, lon: 77.5946 },
  { name: 'Delhi', lat: 28.7041, lon: 77.1025 },
  { name: 'Mumbai', lat: 19.076, lon: 72.8777 },
  { name: 'Chennai', lat: 13.0827, lon: 80.2707 },
  { name: 'Kolkata', lat: 22.5726, lon: 88.3639 },
  { name: 'Hyderabad', lat: 17.385, lon: 78.4867 },
  { name: 'Ahmedabad', lat: 23.0225, lon: 72.5714 },
  { name: 'Pune', lat: 18.5204, lon: 73.8567 },
  { name: 'Jaipur', lat: 26.9124, lon: 75.7873 },
  { name: 'Lucknow', lat: 26.8467, lon: 80.9462 },
];

const PRIORITY_LEVELS = [
  { value: 10, label: 'CRIT', className: 'high' },
  { value: 7, label: 'HIGH', className: 'high' },
  { value: 5, label: 'MED', className: 'medium' },
  { value: 3, label: 'LOW', className: 'low' },
];

export default function MissionPlanner() {
  const [targets, setTargets] = useState([]);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [priority, setPriority] = useState(5);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const addTarget = () => {
    const latVal = parseFloat(lat);
    const lonVal = parseFloat(lon);
    if (isNaN(latVal) || isNaN(lonVal)) return;
    if (latVal < -90 || latVal > 90 || lonVal < -180 || lonVal > 180) return;

    setTargets((prev) => [
      ...prev,
      { lat: latVal, lon: lonVal, priority, id: Date.now() },
    ]);
    setLat('');
    setLon('');
  };

  const addCity = (city) => {
    setTargets((prev) => [
      ...prev,
      {
        lat: city.lat,
        lon: city.lon,
        priority: 5 + Math.floor(Math.random() * 5),
        id: Date.now() + Math.random(),
        name: city.name,
      },
    ]);
  };

  const removeTarget = (id) => {
    setTargets((prev) => prev.filter((t) => t.id !== id));
  };

  const submitPlan = async () => {
    if (targets.length === 0) return;
    setLoading(true);
    setResult(null);

    const payload = targets.map((t) => ({
      lat: t.lat,
      lon: t.lon,
      priority: t.priority,
    }));

    const data = await api.generatePlan(payload);
    setLoading(false);

    if (data) {
      setResult(data);
    }
  };

  const clearAll = () => {
    setTargets([]);
    setResult(null);
  };

  const getPriorityClass = (p) => {
    if (p >= 8) return 'high';
    if (p >= 4) return 'medium';
    return 'low';
  };

  return (
    <div className="planner-layout">
      {/* Left: Form Panel */}
      <div className="planner-form-panel">
        <div className="planner-form-content">
          {/* Quick city select */}
          <div className="form-group">
            <label className="form-label">Quick Select City</label>
            <div className="quick-select-grid">
              {CITIES.map((city) => (
                <button
                  key={city.name}
                  className="quick-city-btn"
                  onClick={() => addCity(city)}
                >
                  <MapPin size={12} />
                  {city.name}
                </button>
              ))}
            </div>
          </div>

          {/* Manual coordinates */}
          <div className="form-group">
            <label className="form-label">Manual Coordinates</label>
            <div className="form-row">
              <input
                className="form-input"
                type="number"
                placeholder="Latitude"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                min={-90}
                max={90}
                step={0.01}
              />
              <input
                className="form-input"
                type="number"
                placeholder="Longitude"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                min={-180}
                max={180}
                step={0.01}
              />
            </div>
          </div>

          {/* Priority selector */}
          <div className="form-group">
            <label className="form-label">Priority</label>
            <div className="priority-select">
              {PRIORITY_LEVELS.map((p) => (
                <button
                  key={p.value}
                  className={`priority-option ${priority === p.value ? `selected ${p.className}` : ''}`}
                  onClick={() => setPriority(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <button
            className="btn btn-add"
            onClick={addTarget}
            disabled={!lat || !lon}
          >
            <Plus size={16} /> Add Target
          </button>

          {/* Targets list */}
          {targets.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <label className="form-label">
                Targets ({targets.length})
              </label>
              <div className="target-list">
                {targets.map((t) => (
                  <div className="target-chip" key={t.id}>
                    <div className="target-chip-info">
                      <span
                        className={`target-chip-priority ${getPriorityClass(t.priority)}`}
                      >
                        P{t.priority}
                      </span>
                      <span className="target-chip-coords">
                        {t.name
                          ? `${t.name} (${t.lat.toFixed(2)}, ${t.lon.toFixed(2)})`
                          : `${t.lat.toFixed(4)}, ${t.lon.toFixed(4)}`}
                      </span>
                    </div>
                    <button
                      className="target-chip-remove"
                      onClick={() => removeTarget(t.id)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="form-actions">
          <button
            className="btn btn-secondary"
            onClick={clearAll}
            style={{ flex: '0 0 auto', width: 'auto', padding: '12px 16px' }}
          >
            Clear
          </button>
          <button
            className="btn btn-primary"
            onClick={submitPlan}
            disabled={targets.length === 0 || loading}
          >
            {loading ? (
              <>
                <span className="spinner" /> Computing...
              </>
            ) : (
              <>
                <Rocket size={16} /> Generate Plan
              </>
            )}
          </button>
        </div>
      </div>

      {/* Right: Results Panel */}
      <div className="results-panel">
        {!result && !loading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <div className="empty-state">
              <Target size={48} />
              <div className="empty-state-title">No Mission Plan</div>
              <div className="empty-state-desc">
                Add imaging targets and click "Generate Plan" to run orbit
                propagation and scheduling.
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 16,
            }}
          >
            <div className="spinner" style={{ width: 32, height: 32 }} />
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Running J2 Orbit Propagation...
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              Calculating visibility windows and scheduling
            </div>
          </div>
        )}

        {result && (
          <>
            {/* Stats bar */}
            <div className="results-header">
              <div className="results-title">Mission Plan Results</div>
              <div className="results-stats">
                <div className="result-stat">
                  <div className="result-stat-value" style={{ color: 'var(--accent-cyan)' }}>
                    {result.total_requests}
                  </div>
                  <div className="result-stat-label">Submitted</div>
                </div>
                <div className="result-stat">
                  <div className="result-stat-value" style={{ color: 'var(--accent-yellow)' }}>
                    {result.feasible_requests}
                  </div>
                  <div className="result-stat-label">Feasible</div>
                </div>
                <div className="result-stat">
                  <div className="result-stat-value" style={{ color: 'var(--accent-green)' }}>
                    {result.scheduled_tasks}
                  </div>
                  <div className="result-stat-label">Scheduled</div>
                </div>
                <div className="result-stat">
                  <div
                    className="result-stat-value"
                    style={{
                      color:
                        result.satellite_health.battery_pct > 50
                          ? 'var(--accent-green)'
                          : 'var(--accent-red)',
                    }}
                  >
                    {result.satellite_health.battery_pct}%
                  </div>
                  <div className="result-stat-label">Battery After</div>
                </div>
              </div>
            </div>

            {/* Task list */}
            <div className="results-content">
              {result.plan_details.length === 0 ? (
                <div className="empty-state">
                  <Crosshair size={48} />
                  <div className="empty-state-title">No Tasks Scheduled</div>
                  <div className="empty-state-desc">
                    No targets were visible from the satellite's orbit within
                    the 24-hour planning window.
                  </div>
                </div>
              ) : (
                <div className="task-list">
                  {result.plan_details.map((task, i) => (
                    <div className="task-card" key={task.task_id}>
                      <div className="task-index">{String(i + 1).padStart(2, '0')}</div>
                      <div className="task-info">
                        <div className="task-id">
                          <Crosshair
                            size={12}
                            style={{
                              display: 'inline',
                              marginRight: 6,
                              color: 'var(--accent-cyan)',
                            }}
                          />
                          {task.task_id}
                        </div>
                        <div className="task-time">
                          <Clock size={10} style={{ display: 'inline', marginRight: 4 }} />
                          {new Date(task.start_time).toLocaleTimeString()} -{' '}
                          {new Date(task.end_time).toLocaleTimeString()}
                        </div>
                      </div>
                      <div className="task-costs">
                        <div className="task-cost-item">
                          <div className="task-cost-value" style={{ color: 'var(--accent-yellow)' }}>
                            <Zap size={10} style={{ display: 'inline', marginRight: 2 }} />
                            {task.power_cost_wh} Wh
                          </div>
                          <div className="task-cost-label">Power</div>
                        </div>
                        <div className="task-cost-item">
                          <div className="task-cost-value" style={{ color: 'var(--accent-purple)' }}>
                            {task.data_cost_gb.toFixed(1)} Gb
                          </div>
                          <div className="task-cost-label">Data</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
