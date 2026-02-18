import { useState, useCallback } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { api } from './services/api';
import Header from './components/Header';
import CesiumGlobe from './components/CesiumGlobe';
import Telemetry from './components/Telemetry';
import MissionPlanner from './components/MissionPlanner';
import FDIRPanel from './components/FDIRPanel';
import TLEPanel from './components/TLEPanel';
import FlightPanel from './components/FlightPanel';

const WS_URL = 'ws://127.0.0.1:8000/ws/telemetry';

function App() {
  const [view, setView] = useState('control');
  const { telemetry, alerts, connected, clearAlerts } = useWebSocket(WS_URL);

  const handleReset = useCallback(async () => {
    await api.resetSatellite();
    clearAlerts();
  }, [clearAlerts]);

  return (
    <div className="app-layout">
      <Header
        view={view}
        setView={setView}
        health={connected ? 'online' : 'offline'}
        onReset={handleReset}
        alertCount={alerts.filter((a) => a.severity === 'CRITICAL').length}
      />

      <div className="main-content">
        {view === 'control' && (
          <div className="dashboard-layout">
            <CesiumGlobe telemetry={telemetry} />
            <Telemetry telemetry={telemetry} />
          </div>
        )}

        {view === 'flight' && <FlightPanel />}
        {view === 'plan' && <MissionPlanner />}
        {view === 'events' && <FDIRPanel alerts={alerts} />}
        {view === 'tle' && <TLEPanel />}
      </div>
    </div>
  );
}

export default App;
