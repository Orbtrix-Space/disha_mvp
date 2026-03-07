import FDIRPanel from '../components/FDIRPanel';

export default function FDIRDashboard({ alerts, telemetry }) {
  return <FDIRPanel alerts={alerts} telemetry={telemetry} />;
}
