/**
 * LayoutManager — Grid-based drag/resize system for DISHA dashboards.
 *
 * Wraps child widgets in a react-grid-layout grid with:
 *   - LOCKED mode (default): fixed layout, no interaction
 *   - CUSTOM mode: drag headers to reorder, resize via handles
 *   - localStorage persistence per page
 *   - Reset to default
 *
 * Usage:
 *   <LayoutManager pageId="control" defaultLayout={[...]} cols={12}>
 *     <div key="globe" data-grid-title="3D GLOBE">...</div>
 *     <div key="autonomy" data-grid-title="AUTONOMY">...</div>
 *   </LayoutManager>
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { GridLayout } from 'react-grid-layout';
import { Lock, Unlock, RotateCcw, Save } from 'lucide-react';
import 'react-grid-layout/css/styles.css';

const STORAGE_PREFIX = 'disha_layout_';

function loadLayout(pageId) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + pageId);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveLayout(pageId, layout) {
  try {
    localStorage.setItem(STORAGE_PREFIX + pageId, JSON.stringify(layout));
  } catch { /* ignore */ }
}

export default function LayoutManager({
  pageId,
  defaultLayout,
  cols = 12,
  rowHeight = 30,
  children,
  fixedKeys = [],
  className = '',
}) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(1200);
  const [customMode, setCustomMode] = useState(false);
  const [layout, setLayout] = useState(() => loadLayout(pageId) || defaultLayout);

  // Measure container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    setWidth(el.offsetWidth);
    return () => ro.disconnect();
  }, []);

  // Apply static flag to fixed keys
  const processedLayout = useMemo(() => {
    return layout.map(item => ({
      ...item,
      isDraggable: customMode && !fixedKeys.includes(item.i),
      isResizable: customMode && !fixedKeys.includes(item.i),
      static: !customMode || fixedKeys.includes(item.i),
    }));
  }, [layout, customMode, fixedKeys]);

  const onLayoutChange = useCallback((newLayout) => {
    // Preserve minW/minH/maxW/maxH from defaultLayout
    const defaults = {};
    for (const d of defaultLayout) {
      defaults[d.i] = d;
    }
    const merged = newLayout.map(item => ({
      ...item,
      minW: defaults[item.i]?.minW ?? item.minW,
      minH: defaults[item.i]?.minH ?? item.minH,
      maxW: defaults[item.i]?.maxW ?? item.maxW,
      maxH: defaults[item.i]?.maxH ?? item.maxH,
    }));
    setLayout(merged);
    if (customMode) saveLayout(pageId, merged);
  }, [customMode, defaultLayout, pageId]);

  const resetLayout = useCallback(() => {
    setLayout(defaultLayout);
    localStorage.removeItem(STORAGE_PREFIX + pageId);
  }, [defaultLayout, pageId]);

  const toggleMode = () => setCustomMode(prev => !prev);

  return (
    <div ref={containerRef} className={`lm-container ${className} ${customMode ? 'lm-custom-mode' : 'lm-locked-mode'}`}>
      {/* Mode toggle bar */}
      <div className="lm-toolbar">
        <button className={`lm-toolbar-btn ${customMode ? 'active' : ''}`} onClick={toggleMode}
          title={customMode ? 'Lock Layout' : 'Customize Layout'}>
          {customMode ? <Unlock size={12} /> : <Lock size={12} />}
          <span>{customMode ? 'CUSTOMIZING' : 'LOCKED'}</span>
        </button>
        {customMode && (
          <>
            <button className="lm-toolbar-btn" onClick={resetLayout} title="Reset to Default">
              <RotateCcw size={12} /> <span>RESET</span>
            </button>
            <button className="lm-toolbar-btn" onClick={() => saveLayout(pageId, layout)} title="Save Layout">
              <Save size={12} /> <span>SAVE</span>
            </button>
          </>
        )}
        {customMode && <span className="lm-toolbar-hint">Drag headers to move, edges to resize</span>}
      </div>

      <GridLayout
        className="lm-grid"
        layout={processedLayout}
        cols={cols}
        rowHeight={rowHeight}
        width={width}
        onLayoutChange={onLayoutChange}
        draggableHandle=".lm-drag-handle"
        compactType="vertical"
        preventCollision={false}
        margin={[6, 6]}
        containerPadding={[0, 0]}
        useCSSTransforms={true}
      >
        {children}
      </GridLayout>
    </div>
  );
}

/**
 * LayoutWidget — Wrapper for each grid item with drag handle header.
 */
export function LayoutWidget({ title, children, className = '', noPad = false }) {
  return (
    <div className={`lm-widget ${className}`}>
      <div className="lm-drag-handle lm-widget-header">
        <span className="lm-widget-title">{title}</span>
        <div className="lm-widget-grip">
          <span /><span /><span />
        </div>
      </div>
      <div className={`lm-widget-body ${noPad ? 'lm-no-pad' : ''}`}>
        {children}
      </div>
    </div>
  );
}
