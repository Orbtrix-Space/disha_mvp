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

  getConjunctionAssessment: async () => {
    try {
      const response = await client.get('/flight/conjunction');
      return response.data;
    } catch (error) {
      console.error("Conjunction Error:", error.message);
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
};
