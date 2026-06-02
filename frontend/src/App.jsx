import { Component, useCallback } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useWebSocket } from './hooks/useWebSocket';
import { api } from './services/api';
import { ThemeProvider } from './hooks/useTheme';
import Header from './components/Header';
import ControlDashboard from './pages/ControlDashboard';
import FlightDashboard from './pages/FlightDashboard';
import MonitorPage from './pages/MonitorPage';
import ScheduleDashboard from './pages/ScheduleDashboard';
import DemoPanel from './components/DemoPanel';
import DemoTimeline from './components/DemoTimeline';

const WS_URL = 'ws://127.0.0.1:8000/ws/telemetry';

function AppContent() {
  const { telemetry, alerts, connected, contactState, bufferDump, telemetryHistory, clearAlerts, clearBufferDump } = useWebSocket(WS_URL);
  const navigate = useNavigate();
  const location = useLocation();

  // Demo mode is gated on ?demo=true so the panel never shows up in
  // normal use.
  const demoMode = new URLSearchParams(location.search).get('demo') === 'true';

  // Map routes to view names for Header
  const pathToView = { '/': 'control', '/flight': 'flight', '/fdir': 'fdir', '/schedule': 'schedule' };
  const view = pathToView[location.pathname] || 'control';

  const setView = useCallback((v) => {
    const viewToPath = { control: '/', flight: '/flight', fdir: '/fdir', schedule: '/schedule' };
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
        telemetry={telemetry}
      />

      <div className="main-content">
        <Routes>
          <Route path="/" element={
            <ControlDashboard
              telemetry={telemetry}
              alerts={alerts}
              contactState={contactState}
              bufferDump={bufferDump}
              clearBufferDump={clearBufferDump}
              telemetryHistory={telemetryHistory}
            />
          } />
          <Route path="/flight" element={<FlightDashboard telemetry={telemetry} />} />
          <Route path="/fdir" element={<MonitorPage alerts={alerts} telemetry={telemetry} />} />
          <Route path="/schedule" element={<ScheduleDashboard />} />
        </Routes>
      </div>

      {demoMode && (
        <>
          <DemoPanel />
          <div style={{
            position: 'fixed', left: 12, right: 304, bottom: 12,
            zIndex: 100, pointerEvents: 'auto',
          }}>
            <DemoTimeline seconds={180} />
          </div>
        </>
      )}
    </div>
  );
}

/*
 * Catch-all error boundary so a crash in any descendant renders the
 * error + stack on the page instead of a black screen. Temporary
 * diagnostic aid added while tracking down a Control-page regression.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
    // Surface to the JS console too so F12 picks it up
    // eslint-disable-next-line no-console
    console.error('[DISHA error boundary]', error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        padding: 20, fontFamily: "'Poppins', sans-serif", color: '#c4706c',
        background: '#16161a', minHeight: '100vh',
        overflowY: 'auto',
      }}>
        <h2 style={{ marginTop: 0, color: '#d9d9de' }}>UI crashed — error boundary caught it</h2>
        <pre style={{ whiteSpace: 'pre-wrap', color: '#c4706c' }}>
          {String(this.state.error?.stack || this.state.error)}
        </pre>
        <details>
          <summary style={{ cursor: 'pointer', color: '#8a8a93' }}>Component stack</summary>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#8a8a93', fontSize: 11 }}>
            {this.state.info?.componentStack || '(no stack)'}
          </pre>
        </details>
        <button onClick={() => this.setState({ error: null, info: null })}
                style={{
                  marginTop: 12, padding: '6px 14px',
                  background: '#1d1d23', color: '#d9d9de',
                  border: '1px solid #2a2a32', borderRadius: 3,
                  cursor: 'pointer',
                }}>Try again</button>
      </div>
    );
  }
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
