import { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import '../styles/c3.css';

import { api } from '../services/api';
import { useSatellites } from '../hooks/useSatellites';
import { useC3Layout } from '../hooks/useC3Layout';
import TopBar from '../components/c3/TopBar';
import OnboardingEntry from '../components/c3/OnboardingEntry';
import PanelWorkspace from '../components/c3/PanelWorkspace';
import PanelCatalog from '../components/c3/PanelCatalog';
import { PANEL_REGISTRY } from '../components/c3/panels/registry';

/*
 * C3OpsPage — the Control module rebuilt as a mission operations
 * console. Quiet by default. The operator onboards a satellite in
 * seconds, then composes a dashboard by attaching panels. The 2D and
 * 3D views are panels too — they never take over the screen.
 */
export default function C3OpsPage({ telemetry, alerts, contactState, telemetryHistory, connected }) {
  const {
    satellites, activeId, activeSatellite,
    addSatellite, switchTo,
  } = useSatellites();

  const {
    panels, layout, addPanel, removePanel,
    toggleFloat, updateFloat, onLayoutChange,
  } = useC3Layout(activeId);

  const [showCatalog, setShowCatalog] = useState(false);
  const [showOnboard, setShowOnboard] = useState(false);
  const [passes, setPasses] = useState([]);

  // Pass predictions feed the mission-clock panel; refreshed slowly.
  useEffect(() => {
    if (!activeSatellite) return;
    const refresh = async () => {
      const data = await api.getGroundStationPasses();
      if (data?.passes) setPasses(data.passes);
    };
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [activeSatellite]);

  const handleAdd = useCallback(async (spec) => {
    const res = await addSatellite(spec);
    if (res.ok) setShowOnboard(false);
    return res;
  }, [addSatellite]);

  const handlePickPanel = useCallback((type) => {
    const def = PANEL_REGISTRY[type];
    addPanel(type, def?.defaultSize);
  }, [addPanel]);

  const panelProps = { telemetry, alerts, contactState, telemetryHistory, passes };
  const hasSatellite = !!activeSatellite;

  return (
    <div className="c3-root">
      <TopBar
        satellites={satellites}
        activeSatellite={activeSatellite}
        onSwitch={switchTo}
        onAddSatellite={() => setShowOnboard(true)}
        contactState={contactState}
        connected={connected}
      />

      <div className="c3-workspace">
        {!hasSatellite && (
          <div className="c3-empty">
            <OnboardingEntry onSubmit={handleAdd} />
          </div>
        )}

        {hasSatellite && (
          <div className="c3-grid-area">
            <div className="c3-add-bar">
              <button className="c3-btn c3-btn-ghost" style={{ padding: '5px 10px' }}
                      onClick={() => setShowCatalog(true)}>
                <Plus size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                Add panel
              </button>
              <span className="hint">
                {panels.length === 0
                  ? 'Attach panels to compose this dashboard.'
                  : `${panels.length} panel${panels.length === 1 ? '' : 's'} · drag headers to arrange`}
              </span>
            </div>

            <PanelWorkspace
              panels={panels}
              layout={layout}
              panelProps={panelProps}
              onLayoutChange={onLayoutChange}
              removePanel={removePanel}
              toggleFloat={toggleFloat}
              updateFloat={updateFloat}
            />
          </div>
        )}
      </div>

      {showOnboard && (
        <div className="c3-modal-scrim" onClick={() => setShowOnboard(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <OnboardingEntry onSubmit={handleAdd} onCancel={() => setShowOnboard(false)} />
          </div>
        </div>
      )}

      {showCatalog && (
        <PanelCatalog onPick={handlePickPanel} onClose={() => setShowCatalog(false)} />
      )}
    </div>
  );
}
