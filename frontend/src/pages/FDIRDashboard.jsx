import FDIRPanel from '../components/FDIRPanel';
import DashboardSidebar from '../components/DashboardSidebar';
import { useDashboardVisibility } from '../hooks/useDashboardVisibility';

export default function FDIRDashboard({ alerts, telemetry }) {
  const { visible, toggle, setAll, panelLabels } = useDashboardVisibility('monitor');
  return (
    <div className="ctrl-with-rail">
      <DashboardSidebar visible={visible} toggle={toggle} setAll={setAll} panelLabels={panelLabels} showOperations={false} />
      <div className="page-content-flex">
        {visible.main && <FDIRPanel alerts={alerts} telemetry={telemetry} />}
      </div>
    </div>
  );
}
