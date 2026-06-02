/*
 * Per-parameter limit definitions for the C3 Ops console.
 *
 * Ranges mirror config/satellite_config.json (FDIR + constraint rules)
 * so the panel limit colouring agrees with what the backend FDIR engine
 * decides. State is computed from the live value — nothing is faked.
 *
 *   nominal  — inside the green band
 *   warning  — outside nominal, inside the warning band
 *   alarm    — outside the warning band
 *
 * A limit entry is [alarmLow, warnLow, warnHigh, alarmHigh]. Use null
 * for an unbounded side.
 */

export const LIMITS = {
  battery_soc:    [20, 40, null, null],   // %
  battery_voltage:[10.5, 11.0, 13.0, 13.5], // V
  component_temp: [-40, -20, 60, 85],     // °C  (panel)
  battery_temp:   [0, 5, 35, 45],         // °C
  snr:            [5, 8, null, null],     // dB
  pointing_error: [null, null, 1.0, 2.0], // deg
  storage_pct:    [null, null, 80, 90],   // %
  angular_rate:   [null, null, 0.8, 1.0], // deg/s
};

/* Classify a value against a limit tuple → 'nominal' | 'warning' | 'alarm' */
export function classify(param, value) {
  const lim = LIMITS[param];
  if (lim == null || value == null || Number.isNaN(value)) return 'idle';
  const [aLo, wLo, wHi, aHi] = lim;
  if (aLo != null && value < aLo) return 'alarm';
  if (aHi != null && value > aHi) return 'alarm';
  if (wLo != null && value < wLo) return 'warning';
  if (wHi != null && value > wHi) return 'warning';
  return 'nominal';
}

/* Worst of several states — for rolling a subsystem up from its params */
const RANK = { idle: 0, nominal: 1, warning: 2, alarm: 3 };
export function worst(states) {
  return states.reduce((acc, s) => (RANK[s] > RANK[acc] ? s : acc), 'idle');
}

export const STATE_CLASS = {
  idle: 'c3-st-idle',
  nominal: 'c3-st-nominal',
  warning: 'c3-st-warning',
  alarm: 'c3-st-alarm',
};
