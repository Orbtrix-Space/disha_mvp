/*
 * Command catalog — built-in + operator-defined telecommands and
 * packet field schemas, persisted to localStorage.
 *
 * Each command entry:
 *   id:        stable string id
 *   mnemonic:  short uppercase label shown in the picker
 *   apid:      11-bit Application Process ID for the CCSDS packet
 *   description: one-line operator note
 *   params:    list of { name, type, length_bytes }
 *
 * Supported types: u8, u16, u32, f32, str (utf-8, zero-padded)
 *
 * Each packet definition entry (TM or TC structure):
 *   id, name, kind ('tc' | 'tm'), apid, fields: [{ name, type, length_bytes }]
 */

const COMMANDS_KEY = 'disha.tc.commands';
const PACKETS_KEY  = 'disha.tc.packet_definitions';

export const BUILTIN_COMMANDS = [
  {
    id: 'set_mode',
    mnemonic: 'SET_MODE',
    apid: 100,
    description: 'Transition the spacecraft to a named mode',
    params: [
      { name: 'mode_id', type: 'u8', length_bytes: 1 },
    ],
  },
  {
    id: 'downlink_start',
    mnemonic: 'DOWNLINK_START',
    apid: 110,
    description: 'Start payload data downlink to active ground station',
    params: [
      { name: 'channel', type: 'u8',  length_bytes: 1 },
      { name: 'bitrate', type: 'u32', length_bytes: 4 },
    ],
  },
  {
    id: 'thruster_burn',
    mnemonic: 'THRUSTER_BURN',
    apid: 200,
    description: 'Execute an along-track ΔV burn',
    params: [
      { name: 'dv_m_s',     type: 'f32', length_bytes: 4 },
      { name: 'direction',  type: 'u8',  length_bytes: 1 },  // 0=prograde, 1=retrograde
      { name: 'burn_time',  type: 'u32', length_bytes: 4 },  // unix seconds
    ],
  },
  {
    id: 'payload_image',
    mnemonic: 'PAYLOAD_IMAGE',
    apid: 120,
    description: 'Trigger payload imaging at a target lat/lon',
    params: [
      { name: 'lat_deg_x1e6', type: 'u32', length_bytes: 4 },
      { name: 'lon_deg_x1e6', type: 'u32', length_bytes: 4 },
      { name: 'exposure_ms',  type: 'u16', length_bytes: 2 },
    ],
  },
  {
    id: 'reset_subsystem',
    mnemonic: 'RESET_SUBSYSTEM',
    apid: 90,
    description: 'Soft-reset a named subsystem',
    params: [
      { name: 'subsystem_id', type: 'u8', length_bytes: 1 },
    ],
  },
];

export function loadCustomCommands() {
  try {
    const raw = localStorage.getItem(COMMANDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveCustomCommands(list) {
  try { localStorage.setItem(COMMANDS_KEY, JSON.stringify(list)); } catch {}
}

export function loadAllCommands() {
  return [...BUILTIN_COMMANDS, ...loadCustomCommands()];
}

export function loadPacketDefs() {
  try {
    const raw = localStorage.getItem(PACKETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function savePacketDefs(list) {
  try { localStorage.setItem(PACKETS_KEY, JSON.stringify(list)); } catch {}
}

// ─── Field encoding ──────────────────────────────────────────────

const ENC_FNS = {
  u8:  (v, len, view, off) => view.setUint8(off, Number(v) & 0xFF),
  u16: (v, len, view, off) => view.setUint16(off, Number(v) & 0xFFFF, false),
  u32: (v, len, view, off) => view.setUint32(off, Number(v) >>> 0, false),
  f32: (v, len, view, off) => view.setFloat32(off, Number(v), false),
  str: (v, len, view, off) => {
    const enc = new TextEncoder().encode(String(v ?? '').slice(0, len));
    for (let i = 0; i < len; i++) view.setUint8(off + i, enc[i] || 0);
  },
};

export function encodeParams(params, values) {
  const total = params.reduce((s, p) => s + p.length_bytes, 0);
  if (total === 0) {
    // Space Packets need at least one data octet — pad with a single byte.
    return { bytes: new Uint8Array([0x00]), width: 1 };
  }
  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  let off = 0;
  for (const p of params) {
    const v = values[p.name];
    const fn = ENC_FNS[p.type];
    if (!fn) throw new Error(`Unsupported field type: ${p.type}`);
    fn(v, p.length_bytes, view, off);
    off += p.length_bytes;
  }
  return { bytes: new Uint8Array(buf), width: total };
}

export const FIELD_TYPES = ['u8', 'u16', 'u32', 'f32', 'str'];
export function defaultLengthFor(type) {
  return { u8: 1, u16: 2, u32: 4, f32: 4, str: 8 }[type] || 1;
}
