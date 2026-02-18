import { useEffect, useRef, useState, useCallback } from 'react';

export function useWebSocket(url) {
  const [telemetry, setTelemetry] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const alertsRef = useRef([]);

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

        if (data.telemetry) {
          setTelemetry(data.telemetry);
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

  return { telemetry, alerts, connected, clearAlerts };
}
