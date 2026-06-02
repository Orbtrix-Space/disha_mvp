import { useCallback, useEffect, useMemo, useState } from 'react';

/*
 * useDashboardVisibility — per-panel show/hide state for the Control
 * dashboard, persisted in localStorage so the operator's preferred
 * layout survives reloads.
 *
 * The dashboard ships with everything visible; the user trims it down
 * via the left sidebar toggles. Removing a panel from the dashboard is
 * additive — it just hides the section; nothing else changes.
 */

/*
 * Per-page panel definitions used by the sidebar and the dashboards.
 * On the Control page the operator opens panels on demand — only the
 * 3D globe is on by default, everything else stays closed until the
 * operator opens it from the sidebar. Other pages still ship with all
 * panels visible until we restyle them.
 */
export const PAGE_PANELS = {
  control: {
    globe3d:        '3D globe',
    groundtrack2d:  '2D ground track',
    autonomy:       'Autonomy decisions',
    telemetry:      'Telemetry',
    strip:          'Event log & ground contact',
  },
  flight: {
    pipeline: 'Pipeline outputs (OD · conjunctions · maneuver)',
    left:     'TLE source & ground network',
    center:   'Conjunction, RPO & tracking',
    right:    'State vector, power & visibility',
    bottom:   'Orbital elements, timeline & maneuvers',
  },
  monitor:  { main: 'FDIR monitor' },
  schedule: { main: 'Scheduler' },
};

/* Per-panel default visibility. Anything not listed defaults to true. */
export const PAGE_DEFAULTS = {
  control: {
    globe3d:       true,
    groundtrack2d: false,
    autonomy:      false,
    telemetry:     false,
    strip:         false,
  },
  flight: {
    pipeline: true,    // pipeline outputs visible by default
    left:     false,
    center:   false,
    right:    false,
    bottom:   false,
  },
};

// Bumping again because Flight panels now include 'pipeline'.
// Previous v2 layouts won't have it — re-default cleanly.
export const STORAGE_VERSION = 'v3';

// v3: Flight panels gained a 'pipeline' key. Older saved layouts (v2)
// don't have it so we cycle the version once more to apply the new
// defaults cleanly. Past versions are simply ignored, not migrated.
const STORAGE_KEY = (pageId) => `disha.dashboard.visibility.v3.${pageId}`;

function loadFor(pageId, defaults) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(pageId));
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...defaults };
}

export function useDashboardVisibility(pageId) {
  const labels = PAGE_PANELS[pageId] || {};
  const overrides = PAGE_DEFAULTS[pageId] || {};
  const defaults = useMemo(
    () => Object.fromEntries(
      Object.keys(labels).map((k) => [k, overrides[k] !== undefined ? overrides[k] : true]),
    ),
    [labels, overrides],
  );

  const [visible, setVisible] = useState(() => loadFor(pageId, defaults));

  useEffect(() => {
    // Re-load when page changes
    setVisible(loadFor(pageId, defaults));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY(pageId), JSON.stringify(visible)); } catch {}
  }, [pageId, visible]);

  const toggle = useCallback((key) => {
    setVisible((v) => ({ ...v, [key]: !v[key] }));
  }, []);

  const setAll = useCallback((value) => {
    setVisible(Object.fromEntries(Object.keys(defaults).map((k) => [k, value])));
  }, [defaults]);

  return { visible, toggle, setAll, panelLabels: labels };
}

// Back-compat export — earlier dashboards imported this constant.
export const PANEL_LABELS = PAGE_PANELS.control;
