import axios from 'axios';

const API_BASE_URL = "http://127.0.0.1:8000";

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

export const api = {
  getHealth: async () => {
    try {
      const response = await client.get('/');
      return response.data;
    } catch (error) {
      console.error("System Offline:", error.message);
      return null;
    }
  },

  getStatus: async () => {
    try {
      const response = await client.get('/satellite-status');
      return response.data;
    } catch (error) {
      console.error("Status Error:", error.message);
      return null;
    }
  },

  generatePlan: async (targets) => {
    try {
      const response = await client.post('/generate-plan', {
        requests: targets,
      });
      return response.data;
    } catch (error) {
      console.error("Planning Error:", error.message);
      return null;
    }
  },

  resetSatellite: async () => {
    try {
      const response = await client.post('/reset');
      return response.data;
    } catch (error) {
      console.error("Reset Error:", error.message);
      return null;
    }
  },

  loadTLE: async (noradId) => {
    try {
      const response = await client.post('/tle/load', { norad_id: noradId });
      return response.data;
    } catch (error) {
      console.error("TLE Load Error:", error.message);
      return null;
    }
  },

  getCurrentTLE: async () => {
    try {
      const response = await client.get('/tle/current');
      return response.data;
    } catch (error) {
      console.error("TLE Fetch Error:", error.message);
      return null;
    }
  },

  loadTLERaw: async (name, line1, line2) => {
    try {
      const response = await client.post('/tle/load_raw', { name, line1, line2 });
      return response.data;
    } catch (error) {
      console.error("Raw TLE Load Error:", error.message);
      return { status: 'ERROR', message: error.message };
    }
  },

  loadTLEElements: async (name, elements) => {
    try {
      const response = await client.post('/tle/load_elements', { name, ...elements });
      return response.data;
    } catch (error) {
      console.error("Elements Load Error:", error.message);
      return { status: 'ERROR', message: error.message };
    }
  },

  getFDIRAlerts: async () => {
    try {
      const response = await client.get('/fdir/alerts');
      return response.data;
    } catch (error) {
      console.error("FDIR Error:", error.message);
      return null;
    }
  },

  getFDIRStatus: async () => {
    try {
      const response = await client.get('/fdir/status');
      return response.data;
    } catch (error) {
      console.error("FDIR Status Error:", error.message);
      return null;
    }
  },

  getFDIRSummary: async () => {
    try {
      const response = await client.get('/fdir/summary');
      return response.data;
    } catch (error) {
      console.error("FDIR Summary Error:", error.message);
      return null;
    }
  },

  getOrbitPrediction: async () => {
    try {
      const response = await client.get('/orbit/prediction');
      return response.data;
    } catch (error) {
      console.error("Orbit Prediction Error:", error.message);
      return null;
    }
  },

  getOrbitalElements: async () => {
    try {
      const response = await client.get('/flight/orbital-elements');
      return response.data;
    } catch (error) {
      console.error("Orbital Elements Error:", error.message);
      return null;
    }
  },

  getGroundStationPasses: async () => {
    try {
      const response = await client.get('/flight/passes');
      return response.data;
    } catch (error) {
      console.error("Pass Prediction Error:", error.message);
      return null;
    }
  },

  getGroundStations: async () => {
    try {
      const response = await client.get('/flight/ground-stations');
      return response.data;
    } catch (error) {
      console.error("Ground Stations Error:", error.message);
      return null;
    }
  },

  getGroundNetworks: async () => {
    try {
      const response = await client.get('/flight/ground-networks');
      return response.data;
    } catch (error) {
      console.error("Ground Networks Error:", error.message);
      return null;
    }
  },

  setGroundStations: async (network) => {
    try {
      const response = await client.post('/flight/ground-stations/set', { network });
      return response.data;
    } catch (error) {
      console.error("Set Ground Stations Error:", error.message);
      return null;
    }
  },

  addCustomStation: async (name, lat, lon) => {
    try {
      const response = await client.post('/flight/ground-stations/add', { name, lat, lon });
      return response.data;
    } catch (error) {
      console.error("Add Station Error:", error.message);
      return null;
    }
  },

  removeStation: async (name) => {
    try {
      const response = await client.post('/flight/ground-stations/remove', { name });
      return response.data;
    } catch (error) {
      console.error("Remove Station Error:", error.message);
      return null;
    }
  },

  getPowerPrediction: async () => {
    try {
      const response = await client.get('/power/prediction');
      return response.data;
    } catch (error) {
      console.error("Power Prediction Error:", error.message);
      return null;
    }
  },

  getCommandSequences: async () => {
    try {
      const response = await client.get('/commands');
      return response.data;
    } catch (error) {
      console.error("Commands Error:", error.message);
      return null;
    }
  },

  approveCommandSequence: async (sequenceId) => {
    try {
      const response = await client.post(`/commands/${sequenceId}/approve`);
      return response.data;
    } catch (error) {
      console.error("Approve Error:", error.message);
      return null;
    }
  },

  sendCommand: async (command) => {
    try {
      const response = await client.post('/commands/send', { command });
      return response.data;
    } catch (error) {
      console.error("Send Command Error:", error.message);
      return null;
    }
  },

  // Intelligence Layer
  getAutonomyStatus: async () => {
    try {
      const response = await client.get('/intelligence/autonomy');
      return response.data;
    } catch (error) {
      console.error("Autonomy Error:", error.message);
      return null;
    }
  },

  getConstraints: async () => {
    try {
      const response = await client.get('/intelligence/constraints');
      return response.data;
    } catch (error) {
      console.error("Constraints Error:", error.message);
      return null;
    }
  },

  getMargins: async () => {
    try {
      const response = await client.get('/intelligence/margins');
      return response.data;
    } catch (error) {
      console.error("Margins Error:", error.message);
      return null;
    }
  },

  getPowerProjection: async () => {
    try {
      const response = await client.get('/intelligence/power-projection');
      return response.data;
    } catch (error) {
      console.error("Power Projection Error:", error.message);
      return null;
    }
  },

  getAutonomyDecisions: async () => {
    try {
      const response = await client.get('/intelligence/decisions');
      return response.data;
    } catch (error) {
      console.error("Decisions Error:", error.message);
      return null;
    }
  },

  getLatestDecisions: async (count = 10) => {
    try {
      const response = await client.get(`/intelligence/decisions/latest?count=${count}`);
      return response.data;
    } catch (error) {
      console.error("Latest Decisions Error:", error.message);
      return null;
    }
  },

  getFeasibility: async () => {
    try {
      const response = await client.get('/intelligence/feasibility');
      return response.data;
    } catch (error) {
      console.error("Feasibility Error:", error.message);
      return null;
    }
  },

  getCouplingEffects: async () => {
    try {
      const response = await client.get('/intelligence/coupling');
      return response.data;
    } catch (error) {
      console.error("Coupling Error:", error.message);
      return null;
    }
  },

  setAutonomyOverride: async (mode, operator = 'OPERATOR', reason = 'Manual override') => {
    try {
      const response = await client.post('/intelligence/override', { mode, operator, reason });
      return response.data;
    } catch (error) {
      console.error("Override Error:", error.message);
      return null;
    }
  },

  releaseAutonomyOverride: async (operator = 'OPERATOR') => {
    try {
      const response = await client.post(`/intelligence/override/release?operator=${operator}`);
      return response.data;
    } catch (error) {
      console.error("Release Override Error:", error.message);
      return null;
    }
  },

  // ── Demo Control Surface (hidden behind ?demo=true on the UI) ──
  getDemoScenarios: async () => {
    try {
      const r = await client.get('/demo/scenarios');
      return r.data;
    } catch (e) { console.error("Demo Scenarios Error:", e.message); return null; }
  },
  injectAnomaly: async (scenarioId, intensity = 1.0) => {
    try {
      const r = await client.post('/demo/inject_anomaly', { scenario_id: scenarioId, intensity });
      return r.data;
    } catch (e) { console.error("Inject Error:", e.message); return null; }
  },
  cancelDemoRun: async (runId) => {
    try {
      const r = await client.post('/demo/cancel', { run_id: runId });
      return r.data;
    } catch (e) { console.error("Cancel Error:", e.message); return null; }
  },
  resetDemo: async () => {
    try {
      const r = await client.post('/demo/reset');
      return r.data;
    } catch (e) { console.error("Reset Demo Error:", e.message); return null; }
  },
  getDemoStatus: async () => {
    try {
      const r = await client.get('/demo/status');
      return r.data;
    } catch (e) { console.error("Demo Status Error:", e.message); return null; }
  },
  getDemoTimeline: async (seconds = 300) => {
    try {
      const r = await client.get(`/demo/timeline?seconds=${seconds}`);
      return r.data;
    } catch (e) { console.error("Demo Timeline Error:", e.message); return null; }
  },

  // ── Operator uploads (telecommand formats, packet defs, ...) ──
  listUploadKinds: async () => {
    try {
      const r = await client.get('/uploads/kinds');
      return r.data;
    } catch (e) { console.error("Upload kinds error:", e.message); return null; }
  },
  uploadFile: async (kind, file) => {
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await client.post(`/uploads/${kind}`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return r.data;
    } catch (e) {
      console.error("Upload error:", e.message);
      return { ok: false, message: e.message };
    }
  },
  listUploads: async (kind) => {
    try {
      const r = await client.get(`/uploads/${kind}`);
      return r.data;
    } catch (e) { console.error("List uploads error:", e.message); return null; }
  },

  // ── Flight ops pipeline (OD → screen → assess → recommend) ──
  ingestGPSCsv: async (csv, sigma_m = 5.0, frame = 'ECI', source = 'paste') => {
    try {
      const r = await client.post('/flight/ingest_gps', { csv, sigma_m, frame, source });
      return r.data;
    } catch (e) { console.error("Ingest GPS error:", e.message);
      return { ok: false, message: e.response?.data?.detail || e.message }; }
  },
  ingestSyntheticGPS: async (n_fixes = 15, span_seconds = 600, noise_m = 5.0) => {
    try {
      const r = await client.post('/flight/ingest_synthetic',
                                  { n_fixes, span_seconds, noise_m });
      return r.data;
    } catch (e) { console.error("Synth GPS error:", e.message); return null; }
  },
  runFlightPipeline: async (horizon_hours = 24, coarse_step_seconds = 30) => {
    try {
      const r = await client.post('/flight/run_pipeline',
        { horizon_hours, coarse_step_seconds });
      return r.data;
    } catch (e) { console.error("Run pipeline error:", e.message); return null; }
  },
  getFlightPipeline: async () => {
    try {
      const r = await client.get('/flight/pipeline');
      return r.data;
    } catch (e) { console.error("Pipeline status error:", e.message); return null; }
  },
  resetFlightPipeline: async () => {
    try {
      const r = await client.post('/flight/pipeline/reset');
      return r.data;
    } catch (e) { console.error("Reset pipeline error:", e.message); return null; }
  },
  approveManeuver: async (approved, operator = 'OPERATOR', note = null) => {
    try {
      const r = await client.post('/flight/maneuver/approve', { approved, operator, note });
      return r.data;
    } catch (e) { console.error("Approve maneuver error:", e.message); return null; }
  },
  uploadFlightCatalog: async (tle, source = 'paste') => {
    try {
      const r = await client.post('/flight/catalog', { tle, source });
      return r.data;
    } catch (e) { console.error("Catalog upload error:", e.message);
      return { ok: false, message: e.response?.data?.detail || e.message }; }
  },
  clearFlightCatalog: async () => {
    try {
      const r = await client.delete('/flight/catalog');
      return r.data;
    } catch (e) { console.error("Catalog clear error:", e.message); return null; }
  },
  getFlightCatalog: async () => {
    try {
      const r = await client.get('/flight/catalog');
      return r.data;
    } catch (e) { console.error("Catalog get error:", e.message); return null; }
  },

  // ── Constellation tasking (SCHEDULE page) ──────────────────
  getSchedulerState: async () => {
    try {
      const r = await client.get('/scheduler/state');
      return r.data;
    } catch (e) { console.error('Scheduler state error:', e.message); return null; }
  },
  getConstellation: async () => {
    try {
      const r = await client.get('/scheduler/constellation');
      return r.data;
    } catch (e) { console.error('Constellation error:', e.message); return null; }
  },
  getConstellationTracks: async (stepSec = 60) => {
    try {
      const r = await client.get(`/scheduler/constellation/tracks?step_sec=${stepSec}`);
      return r.data;
    } catch (e) { console.error('Tracks error:', e.message); return null; }
  },
  getTargets: async () => {
    try {
      const r = await client.get('/scheduler/targets');
      return r.data;
    } catch (e) { console.error('Targets error:', e.message); return null; }
  },
  uploadTargetDeck: async (file) => {
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await client.post('/scheduler/targets/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return r.data;
    } catch (e) {
      return { ok: false, message: e.response?.data?.detail || e.message };
    }
  },
  setHorizon: async (horizon_start, horizon_stop) => {
    try {
      const r = await client.post('/scheduler/horizon',
        { horizon_start, horizon_stop, compare_baseline: true });
      return r.data;
    } catch (e) { console.error('Horizon error:', e.message); return null; }
  },
  setMission: async (payload) => {
    try {
      const r = await client.post('/scheduler/mission', payload);
      return r.data;
    } catch (e) { console.error('Mission error:', e.message); return null; }
  },
  runOptimize: async (horizon_start, horizon_stop, compare_baseline = true) => {
    try {
      const r = await client.post('/scheduler/optimize',
        { horizon_start, horizon_stop, compare_baseline }, { timeout: 120000 });
      return r.data;
    } catch (e) { console.error('Optimize error:', e.message);
      return { ok: false, message: e.message }; }
  },
  getSchedule: async () => {
    try {
      const r = await client.get('/scheduler/schedule');
      return r.data;
    } catch (e) { console.error('Schedule error:', e.message); return null; }
  },
  getSchedulerAnalytics: async () => {
    try {
      const r = await client.get('/scheduler/analytics');
      return r.data;
    } catch (e) { console.error('Scheduler analytics error:', e.message); return null; }
  },
  getSchedulerSystemStatus: async () => {
    try {
      const r = await client.get('/scheduler/system-status');
      return r.data;
    } catch (e) { console.error('Scheduler status error:', e.message); return null; }
  },

  // ── MONITOR / NETRA ────────────────────────────────────────
  getMonitorSnapshot: async () => {
    try { return (await client.get('/monitor/snapshot')).data; }
    catch (e) { console.error('Monitor snapshot:', e.message); return null; }
  },
  getRiskHistory: async (minutes = 60) => {
    try { return (await client.get(`/monitor/risk-history?minutes=${minutes}`)).data; }
    catch (e) { return null; }
  },
  getRuleGroups: async () => {
    try { return (await client.get('/monitor/rule-groups')).data; }
    catch (e) { return null; }
  },
  getFiringHeatmap: async (hours = 24, bucketMin = 5) => {
    try {
      return (await client.get(`/monitor/firing-heatmap?hours=${hours}&bucket_min=${bucketMin}`)).data;
    } catch (e) { return null; }
  },
  getAnomalies: async (minutes = 60) => {
    try { return (await client.get(`/monitor/anomalies?minutes=${minutes}`)).data; }
    catch (e) { return null; }
  },
  getStability: async (minutes = 60) => {
    try { return (await client.get(`/monitor/stability?minutes=${minutes}`)).data; }
    catch (e) { return null; }
  },
  getStateHistory: async (hours = 24) => {
    try { return (await client.get(`/monitor/state-history?hours=${hours}`)).data; }
    catch (e) { return null; }
  },
  getSubsystemTrend: async (hours = 24) => {
    try { return (await client.get(`/monitor/subsystem-trend?hours=${hours}`)).data; }
    catch (e) { return null; }
  },
  getMonitorSankey: async (minutes = 15) => {
    try { return (await client.get(`/monitor/sankey?minutes=${minutes}`)).data; }
    catch (e) { return null; }
  },
  netraChat: async (question, history = []) => {
    try {
      const r = await client.post('/netra/chat', { question, history });
      return r.data;
    } catch (e) {
      return { answer: 'NETRA unreachable.', citations: [] };
    }
  },
  netraSuggestions: async () => {
    try { return (await client.get('/netra/suggested-prompts')).data; }
    catch (e) { return { prompts: [] }; }
  },
};
