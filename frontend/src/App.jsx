import { useState, useEffect, useCallback } from 'react';
import { api } from './services/api';
import Header from './components/Header';
import SatelliteMap, { eciToGeodetic } from './components/SatelliteMap';
import Telemetry from './components/Telemetry';
import MissionPlanner from './components/MissionPlanner';

const POLL_INTERVAL = 2000;
const MAX_TRACK_POINTS = 200;

function App() {
  const [view, setView] = useState('dashboard');
  const [status, setStatus] = useState(null);
  const [health, setHealth] = useState('offline');
  const [groundTrack, setGroundTrack] = useState([]);

  // Poll satellite status
  useEffect(() => {
    let active = true;

    const poll = async () => {
      const data = await api.getStatus();
      if (!active) return;

      if (data) {
        setHealth('online');
        setStatus(data);
        const pos = eciToGeodetic(
          data.position[0],
          data.position[1],
          data.position[2]
        );
        setGroundTrack((prev) => [...prev, pos].slice(-MAX_TRACK_POINTS));
      } else {
        setHealth('offline');
      }
    };

    poll();
    const id = setInterval(poll, POLL_INTERVAL);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const handleReset = useCallback(async () => {
    const res = await api.resetSatellite();
    if (res) {
      setStatus(res.satellite_health);
      setGroundTrack([]);
    }
  }, []);

  return (
    <div className="app-layout">
      <Header
        view={view}
        setView={setView}
        health={health}
        onReset={handleReset}
      />

      <div className="main-content">
        {view === 'dashboard' && (
          <div className="dashboard-layout">
            <SatelliteMap
              groundTrack={groundTrack}
              currentPos={status?.position}
              velocity={status?.velocity}
            />
            <Telemetry status={status} />
          </div>
        )}

        {view === 'planner' && <MissionPlanner />}
      </div>
    </div>
  );
}

export default App;
