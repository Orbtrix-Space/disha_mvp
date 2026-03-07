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
};
