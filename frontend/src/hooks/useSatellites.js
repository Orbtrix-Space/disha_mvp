import { useState, useCallback, useEffect } from 'react';
import { api } from '../services/api';

/*
 * useSatellites — manages the operator's onboarded spacecraft.
 *
 * The backend simulates one satellite at a time. The frontend keeps the
 * roster of onboarded satellites in localStorage; switching the active
 * satellite re-loads its orbit on the backend (real SGP4 propagation).
 * Backend-side multi-satellite is a later change — the storage shape
 * here is forward-compatible with it.
 */

const SAT_KEY = 'disha.c3.satellites';
const ACTIVE_KEY = 'disha.c3.activeSatellite';

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

let _id = 0;
const newId = () => `sat-${Date.now().toString(36)}-${(_id++).toString(36)}`;

export function useSatellites() {
  const [satellites, setSatellites] = useState(() => load(SAT_KEY, []));
  const [activeId, setActiveId] = useState(() => load(ACTIVE_KEY, null));

  useEffect(() => {
    localStorage.setItem(SAT_KEY, JSON.stringify(satellites));
  }, [satellites]);
  useEffect(() => {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(activeId));
  }, [activeId]);

  const activeSatellite = satellites.find((s) => s.id === activeId) || null;

  /* Push a satellite's orbit to the backend. Returns the API result. */
  const bringOnline = useCallback(async (sat) => {
    if (sat.mode === 'norad') {
      return api.loadTLE(parseInt(sat.noradId, 10));
    }
    if (sat.mode === 'tle') {
      return api.loadTLERaw(sat.name, sat.line1, sat.line2);
    }
    if (sat.mode === 'elements') {
      return api.loadTLEElements(sat.name, sat.elements);
    }
    return { status: 'ERROR', message: 'Unknown onboarding mode' };
  }, []);

  /* Onboard a new satellite: persist it, load it on the backend, make
     it the active context. */
  const addSatellite = useCallback(async (spec) => {
    const sat = { id: newId(), addedAt: Date.now(), ...spec };
    const result = await bringOnline(sat);
    if (!result || result.status !== 'SUCCESS') {
      return { ok: false, error: result?.message || 'Backend rejected the orbit' };
    }
    // Capture the resolved name from the backend if the operator left it blank
    sat.resolvedName = result.tle?.satellite_name || sat.name;
    setSatellites((prev) => [...prev, sat]);
    setActiveId(sat.id);
    return { ok: true, satellite: sat };
  }, [bringOnline]);

  /* Switch active satellite — re-loads its orbit on the backend. */
  const switchTo = useCallback(async (id) => {
    const sat = satellites.find((s) => s.id === id);
    if (!sat) return { ok: false };
    setActiveId(id);
    const result = await bringOnline(sat);
    return { ok: result?.status === 'SUCCESS' };
  }, [satellites, bringOnline]);

  const removeSatellite = useCallback((id) => {
    setSatellites((prev) => prev.filter((s) => s.id !== id));
    setActiveId((cur) => (cur === id ? null : cur));
  }, []);

  return {
    satellites,
    activeId,
    activeSatellite,
    addSatellite,
    switchTo,
    removeSatellite,
  };
}
