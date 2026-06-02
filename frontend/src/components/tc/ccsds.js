/*
 * Real CCSDS encoders for the Control telecommand pipeline.
 *
 *   - buildSpacePacket(apid, seqCount, dataField)
 *       → Space Packet Protocol (CCSDS 133.0-B-2) primary header (6 B)
 *         + user data field.
 *
 *   - buildTCFrame(scid, vcid, frameSeq, dataField)
 *       → TC Transfer Frame (CCSDS 232.0-B-4) primary header (5 B)
 *         + data field + 16-bit CRC-16-CCITT trailer.
 *
 *   - aesGcmEncrypt(key, plaintext, aad)
 *       → AES-GCM via Web Crypto. Returns { iv, ciphertext, tag }.
 *
 * These are honest implementations of the bit layouts in the CCSDS
 * Blue Books. They're not a full SDLS stack — no Security Header
 * before the encrypted block, no anti-replay counter. That's the
 * next iteration. What ships here is enough to demo the substance:
 * real header fields, real CRC, real AES-GCM.
 */

// ─── Bit/byte helpers ────────────────────────────────────────────

export function hex(bytes, sep = ' ') {
  if (!bytes) return '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join(sep);
}

function pack16(n) {
  return new Uint8Array([(n >>> 8) & 0xff, n & 0xff]);
}

function concat(...arrs) {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

// ─── CCSDS Space Packet ──────────────────────────────────────────
//
// Primary header (6 bytes):
//   Octet 0:1  | Version(3) Type(1) SecHdrFlag(1) APID(11)
//   Octet 2:3  | SeqFlags(2) PacketSeqCount(14)
//   Octet 4:5  | Packet Data Length (= N-1, N = data field length)

export function buildSpacePacket({
  apid,
  seqCount,
  dataField,
  isTelecommand = true,
  hasSecondaryHeader = false,
  sequenceFlags = 0b11,  // 11 = unsegmented (whole packet)
  versionNumber = 0,
}) {
  if (apid > 0x7FF) throw new Error('APID out of range (11 bits)');
  if (seqCount > 0x3FFF) throw new Error('Sequence count out of range (14 bits)');

  const word0 =
    ((versionNumber & 0b111) << 13) |
    (((isTelecommand ? 1 : 0) & 0b1) << 12) |
    (((hasSecondaryHeader ? 1 : 0) & 0b1) << 11) |
    (apid & 0x7FF);

  const word1 =
    ((sequenceFlags & 0b11) << 14) |
    (seqCount & 0x3FFF);

  const length = dataField.length;
  if (length === 0) throw new Error('Space Packet data field must be at least 1 octet');
  const word2 = (length - 1) & 0xFFFF;

  const header = new Uint8Array(6);
  header.set(pack16(word0), 0);
  header.set(pack16(word1), 2);
  header.set(pack16(word2), 4);

  return {
    bytes: concat(header, dataField),
    header,
    fields: {
      version: versionNumber,
      type: isTelecommand ? 1 : 0,
      sec_header_flag: hasSecondaryHeader ? 1 : 0,
      apid,
      sequence_flags: sequenceFlags,
      sequence_count: seqCount,
      data_length: length - 1,
    },
  };
}

// ─── CRC-16-CCITT (poly 0x1021, init 0xFFFF) ─────────────────────
//
// Required by CCSDS 232.0-B-4 as the Frame Error Control Field.

export function crc16Ccitt(bytes, init = 0xFFFF) {
  let crc = init;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc;
}

// ─── TC Transfer Frame ───────────────────────────────────────────
//
// Primary header (5 bytes):
//   Octet 0    | Version(2) BypassFlag(1) CtrlCmd(1) ResSpare(2)
//              | SpacecraftID hi(2)
//   Octet 1    | SpacecraftID lo(8)
//   Octet 2    | VCID(6) FrameLen hi(2)
//   Octet 3    | FrameLen lo(8)
//   Octet 4    | Frame Seq Number (8)
// Trailer      | CRC-16-CCITT (2 bytes)

export function buildTCFrame({
  scid,
  vcid,
  frameSeq,
  dataField,
  bypassFlag = 0,          // 0 = Type-A (acknowledged)
  controlCommandFlag = 0,  // 0 = data frame, 1 = control frame
  tfVersion = 0,
}) {
  if (scid > 0x3FF) throw new Error('SCID out of range (10 bits)');
  if (vcid > 0x3F)  throw new Error('VCID out of range (6 bits)');
  if (frameSeq > 0xFF) throw new Error('Frame seq out of range (8 bits)');

  const frameLen = 5 /*hdr*/ + dataField.length + 2 /*CRC*/ - 1;
  if (frameLen > 0x3FF) throw new Error('Frame length out of range (10 bits)');

  const oct0 =
    ((tfVersion & 0b11) << 6) |
    ((bypassFlag & 0b1) << 5) |
    ((controlCommandFlag & 0b1) << 4) |
    /* 2-bit spare */
    ((scid >>> 8) & 0b11);
  const oct1 = scid & 0xFF;
  const oct2 = ((vcid & 0x3F) << 2) | ((frameLen >>> 8) & 0b11);
  const oct3 = frameLen & 0xFF;
  const oct4 = frameSeq & 0xFF;

  const header = new Uint8Array([oct0, oct1, oct2, oct3, oct4]);
  const frameNoCrc = concat(header, dataField);
  const crc = crc16Ccitt(frameNoCrc);
  const trailer = pack16(crc);

  return {
    bytes: concat(frameNoCrc, trailer),
    header,
    fields: {
      version: tfVersion,
      bypass_flag: bypassFlag,
      control_command_flag: controlCommandFlag,
      scid,
      vcid,
      frame_length: frameLen,
      frame_seq: frameSeq,
      crc16: crc,
    },
    crc,
  };
}

// ─── AES-GCM (Web Crypto) ────────────────────────────────────────
//
// SDLS uses AES-GCM under the Authentication+Encryption mode.
// We keep the same primitive — random 96-bit IV per packet, 128-bit
// authentication tag included at the end of the ciphertext per the
// Web Crypto API contract. Additional-Authenticated-Data (AAD) carries
// the cleartext Space Packet primary header so the receiver can
// authenticate routing fields without decrypting them.

const KEY_STORAGE = 'disha.tc.aes_gcm_key';

async function importKey(rawKeyBytes) {
  return crypto.subtle.importKey(
    'raw', rawKeyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'],
  );
}

export async function ensureSessionKey() {
  // Demo session key — generated once per browser and reused. Real
  // deployments would derive a key per pass from a long-term KEK.
  let b64 = null;
  try { b64 = localStorage.getItem(KEY_STORAGE); } catch {}
  if (b64) {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return { key: await importKey(bytes), raw: bytes, fresh: false };
  }
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  try {
    localStorage.setItem(
      KEY_STORAGE,
      btoa(String.fromCharCode(...bytes)),
    );
  } catch {}
  return { key: await importKey(bytes), raw: bytes, fresh: true };
}

export async function aesGcmEncrypt(key, plaintext, aad = null) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const params = { name: 'AES-GCM', iv, tagLength: 128 };
  if (aad) params.additionalData = aad;
  const out = await crypto.subtle.encrypt(params, key, plaintext);
  const outBytes = new Uint8Array(out);
  // Web Crypto returns ciphertext||tag concatenated; split for display.
  const tag = outBytes.slice(outBytes.length - 16);
  const ciphertext = outBytes.slice(0, outBytes.length - 16);
  return { iv, ciphertext, tag };
}
