import { useCallback } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useWebSocket } from './hooks/useWebSocket';
import { api } from './services/api';
import Header from './components/Header';
import ControlDashboard from './pages/ControlDashboard';
import FDIRDashboard from './pages/FDIRDashboard';
import ScheduleDashboard from './pages/ScheduleDashboard';

const WS_URL = 'ws://127.0.0.1:8000/ws/telemetry';

function AppContent() {
  const { telemetry, alerts, connected, clearAlerts } = useWebSocket(WS_URL);
  const navigate = useNavigate();
  const location = useLocation();

  // Map routes to view names for Header
  const pathToView = { '/': 'control', '/fdir': 'fdir', '/schedule': 'schedule' };
  const view = pathToView[location.pathname] || 'control';

  const setView = useCallback((v) => {
    const viewToPath = { control: '/', fdir: '/fdir', schedule: '/schedule' };
    navigate(viewToPath[v] || '/');
  }, [navigate]);

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
        <Routes>
          <Route path="/" element={<ControlDashboard telemetry={telemetry} alerts={alerts} />} />
          <Route path="/fdir" element={<FDIRDashboard alerts={alerts} />} />
          <Route path="/schedule" element={<ScheduleDashboard />} />
        </Routes>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
