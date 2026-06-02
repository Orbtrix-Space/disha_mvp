import { useMemo } from 'react';
import { GridLayout, useContainerWidth, verticalCompactor } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import PanelFrame from './PanelFrame';
import FloatingPanel from './FloatingPanel';
import { PANEL_REGISTRY } from './panels/registry';

/*
 * PanelWorkspace — the configurable dashboard. Non-floating panels live
 * in a react-grid-layout grid (drag, resize, reflow). Floating panels
 * render as free windows over the grid. The center stays empty until
 * the operator attaches panels.
 *
 * Uses the react-grid-layout v2 API: useContainerWidth() instead of the
 * old WidthProvider HOC, and config objects (gridConfig / dragConfig)
 * instead of flat props.
 */
export default function PanelWorkspace({
  panels, layout, panelProps,
  onLayoutChange, removePanel, toggleFloat, updateFloat,
}) {
  const { width, containerRef, mounted } = useContainerWidth();
  const docked = useMemo(() => panels.filter((p) => !p.floating), [panels]);
  const floating = useMemo(() => panels.filter((p) => p.floating), [panels]);

  const renderBody = (panel) => {
    const def = PANEL_REGISTRY[panel.type];
    if (!def) return <div className="c3-empty-grid">Unknown panel</div>;
    const Component = def.component;
    return <Component {...panelProps} />;
  };

  return (
    <div ref={containerRef}>
      {panels.length === 0 && (
        <div className="c3-empty-grid">
          Empty workspace. Use “Add panel” to compose your dashboard.
        </div>
      )}

      {mounted && docked.length > 0 && (
        <GridLayout
          width={width}
          layout={layout}
          gridConfig={{ cols: 12, rowHeight: 30, margin: [8, 8] }}
          dragConfig={{ handle: '.c3-panel-drag' }}
          compactor={verticalCompactor}
          onLayoutChange={onLayoutChange}
        >
          {docked.map((panel) => {
            const def = PANEL_REGISTRY[panel.type];
            if (!def) return <div key={panel.i} />;
            return (
              <div key={panel.i}>
                <PanelFrame
                  def={def}
                  onPopOut={() => toggleFloat(panel.i)}
                  onClose={() => removePanel(panel.i)}
                >
                  {renderBody(panel)}
                </PanelFrame>
              </div>
            );
          })}
        </GridLayout>
      )}

      {floating.map((panel) => {
        const def = PANEL_REGISTRY[panel.type];
        if (!def) return null;
        return (
          <FloatingPanel
            key={panel.i}
            def={def}
            float={panel.float}
            onChange={(f) => updateFloat(panel.i, f)}
            onDock={() => toggleFloat(panel.i)}
            onClose={() => removePanel(panel.i)}
          >
            {renderBody(panel)}
          </FloatingPanel>
        );
      })}
    </div>
  );
}
