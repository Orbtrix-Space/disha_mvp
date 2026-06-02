import { useState, useCallback, useEffect, useRef } from 'react';

/*
 * useC3Layout — per-satellite panel workspace persistence.
 *
 * Each satellite gets its own dashboard: which panels are attached,
 * their grid geometry, and any popped-out floating panels. Stored in
 * localStorage keyed by satellite id (backend persistence later).
 *
 * A "panel" instance: { i, type, floating, float:{x,y,w,h} }
 *   i      — unique instance id (also the grid layout key)
 *   type   — registry key
 *   floating — when true the panel is a floating window, out of the grid
 * The grid layout array is react-grid-layout's native shape.
 */

const KEY = (satId) => `disha.c3.layout.${satId || 'none'}`;

function load(satId) {
  try {
    const raw = localStorage.getItem(KEY(satId));
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { panels: [], layout: [] };
}

let _seq = 0;
const newPanelId = (type) => `${type}-${Date.now().toString(36)}-${(_seq++).toString(36)}`;

export function useC3Layout(satId) {
  const [panels, setPanels] = useState([]);
  const [layout, setLayout] = useState([]);
  const loadedFor = useRef(null);

  // Load when the active satellite changes
  useEffect(() => {
    if (!satId) {
      setPanels([]);
      setLayout([]);
      loadedFor.current = null;
      return;
    }
    const stored = load(satId);
    setPanels(stored.panels || []);
    setLayout(stored.layout || []);
    loadedFor.current = satId;
  }, [satId]);

  // Persist on change (only once the right satellite is loaded in)
  useEffect(() => {
    if (!satId || loadedFor.current !== satId) return;
    localStorage.setItem(KEY(satId), JSON.stringify({ panels, layout }));
  }, [satId, panels, layout]);

  const addPanel = useCallback((type, defaultSize = { w: 4, h: 6 }) => {
    const i = newPanelId(type);
    setPanels((prev) => [...prev, { i, type, floating: false }]);
    setLayout((prev) => {
      // Place the new panel on a fresh row below everything else; the
      // vertical compactor pulls it up into any gap afterwards.
      const bottom = prev.reduce((m, l) => Math.max(m, l.y + l.h), 0);
      return [
        ...prev,
        { i, x: 0, y: bottom, w: defaultSize.w, h: defaultSize.h, minW: 2, minH: 3 },
      ];
    });
    return i;
  }, []);

  const removePanel = useCallback((i) => {
    setPanels((prev) => prev.filter((p) => p.i !== i));
    setLayout((prev) => prev.filter((l) => l.i !== i));
  }, []);

  const toggleFloat = useCallback((i) => {
    setPanels((prev) => prev.map((p) => {
      if (p.i !== i) return p;
      if (p.floating) return { ...p, floating: false };
      return {
        ...p,
        floating: true,
        float: p.float || { x: 160, y: 120, w: 420, h: 320 },
      };
    }));
  }, []);

  const updateFloat = useCallback((i, float) => {
    setPanels((prev) => prev.map((p) => (p.i === i ? { ...p, float } : p)));
  }, []);

  const onLayoutChange = useCallback((next) => {
    // Keep only entries for panels still in the grid
    setLayout(next.map((l) => ({ ...l })));
  }, []);

  return {
    panels,
    layout,
    addPanel,
    removePanel,
    toggleFloat,
    updateFloat,
    onLayoutChange,
  };
}
