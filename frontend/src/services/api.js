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
        requests: targets
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
};
