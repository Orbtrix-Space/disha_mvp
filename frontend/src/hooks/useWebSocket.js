import { useEffect, useRef, useState, useCallback } from 'react';

export function useWebSocket(url) {
  const [telemetry, setTelemetry] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [connected, setConnected] = useState(false);
  const [contactState, setContactState] = useState({
    inContact: false,
    source: 'PREDICTED',
    station: null,
    elevationDeg: 0,
    blackoutSec: 0,
  });
  const [bufferDump, setBufferDump] = useState(null);
  const [telemetryHistory, setTelemetryHistory] = useState([]);
  const wsRef = useRef(null);
  const alertsRef = useRef([]);
  const historyRef = useRef([]);

  useEffect(() => {
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!cancelled) setConnected(true);
      };

      ws.onclose = () => {
        if (!cancelled) {
          setConnected(false);
          setTimeout(connect, 2000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'tle_loaded') {
          // New satellite loaded — clear all old state
          alertsRef.current = [];
          historyRef.current = [];
          setAlerts([]);
          setBufferDump(null);
          setTelemetry(null);
          setTelemetryHistory([]);
          return;
        }

        if (data.type === 'buffer_dump') {
          // Ground station contact acquired — received stored telemetry
          setBufferDump({
            frames: data.frames,
            count: data.count,
            receivedAt: Date.now(),
          });
          return;
        }

        if (data.telemetry) {
          setTelemetry(data.telemetry);

          // Store history (last 30 minutes = 1800 frames at 1Hz)
          historyRef.current.push({
            ...data.telemetry,
            _receivedAt: Date.now(),
          });
          if (historyRef.current.length > 1800) historyRef.current.shift();
          // Update state every 10 frames to avoid excessive re-renders
          if (historyRef.current.length % 10 === 0) {
            setTelemetryHistory([...historyRef.current]);
          }

          // Update contact state from telemetry metadata
          setContactState({
            inContact: data.telemetry.in_contact || false,
            source: data.telemetry.source || 'LIVE',
            station: data.telemetry.contact_station || null,
            elevationDeg: data.telemetry.contact_elevation_deg || 0,
            blackoutSec: data.telemetry.blackout_duration_sec || 0,
          });
        }

        if (data.alerts && data.alerts.length > 0) {
          alertsRef.current = [
            ...data.alerts,
            ...alertsRef.current,
          ].slice(0, 200);
          setAlerts([...alertsRef.current]);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [url]);

  const clearAlerts = useCallback(() => {
    alertsRef.current = [];
    setAlerts([]);
  }, []);

  const clearBufferDump = useCallback(() => {
    setBufferDump(null);
  }, []);

  return { telemetry, alerts, connected, contactState, bufferDump, telemetryHistory, clearAlerts, clearBufferDump };
}
