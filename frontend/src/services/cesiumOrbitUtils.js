/**
 * Orbit rendering utilities for Cesium.
 * Simple Keplerian approximation for client-side prediction display.
 * Authoritative positions come from backend via WebSocket.
 */

const EARTH_RADIUS_KM = 6378.137;
const MU_EARTH = 398600.4418;

/**
 * Approximate ECI to geodetic (lat/lon/alt).
 * Simplified - ignores Earth rotation for quick client-side use.
 * Backend provides proper GMST-corrected values.
 */
export function eciToGeodetic(x, y, z) {
  const r = Math.sqrt(x * x + y * y + z * z);
  const lat = Math.asin(z / r) * (180 / Math.PI);
  const lon = Math.atan2(y, x) * (180 / Math.PI);
  const alt_km = r - EARTH_RADIUS_KM;
  return { lat, lon, alt_km };
}

/**
 * Calculate orbital period from semi-major axis.
 */
export function orbitalPeriod(semiMajorAxis_km) {
  return 2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxis_km, 3) / MU_EARTH);
}
