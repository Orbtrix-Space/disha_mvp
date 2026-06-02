import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Send, Shield, Hash, Key, Loader2 } from 'lucide-react';
import {
  buildSpacePacket, buildTCFrame, ensureSessionKey, aesGcmEncrypt, hex,
} from './ccsds';
import { loadAllCommands, encodeParams } from './catalog';

/*
 * TelecommandModal — the full C3 telecommand path, visible step by step:
 *
 *   1. Pick a command + fill parameters
 *   2. Packetize as a CCSDS Space Packet (field breakdown + hex)
 *   3. Wrap in a TC Transfer Frame (CRC-16-CCITT, hex)
 *   4. Encrypt the frame data field with AES-GCM (real Web Crypto,
 *      IV / ciphertext / tag visible)
 *   5. "Uplink" — simulated send + mission log trail
 *
 * Nothing is faked above the radio layer. The packet bytes are real
 * CCSDS, the CRC is real, the encryption is real.
 */

const SCID_DEFAULT = 0x1A5;
const VCID_DEFAULT = 1;
const SEQ_STORAGE = 'disha.tc.seq_count';

function nextSeq() {
  let n = 0;
  try { n = parseInt(localStorage.getItem(SEQ_STORAGE) || '0', 10); } catch {}
  if (Number.isNaN(n)) n = 0;
  n = (n + 1) & 0x3FFF;
  try { localStorage.setItem(SEQ_STORAGE, String(n)); } catch {}
  return n;
}

function ParamField({ p, value, onChange }) {
  return (
    <label className="tc-param-row">
      <span className="tc-param-name mono">{p.name}</span>
      <span className="tc-param-type mono">{p.type}·{p.length_bytes}B</span>
      <input
        className="tc-input mono"
        type={p.type === 'f32' || p.type.startsWith('u') ? 'number' : 'text'}
        value={value ?? ''}
        onChange={(e) => onChange(p.name, e.target.value)}
      />
    </label>
  );
}

function HexBytes({ bytes, label, color }) {
  if (!bytes) return null;
  return (
    <div className="tc-hex-block">
      <div className="tc-hex-label">
        <span style={{ color }}>{label}</span>
        <span className="tc-hex-len mono">{bytes.length} B</span>
      </div>
      <div className="tc-hex-body mono">{hex(bytes)}</div>
    </div>
  );
}

function FieldList({ fields }) {
  return (
    <ul className="tc-fields-list">
      {Object.entries(fields).map(([k, v]) => (
        <li key={k}>
          <span className="tc-field-k mono">{k}</span>
          <span className="tc-field-v mono">
            {typeof v === 'number' ? `0x${v.toString(16)}` : String(v)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function TelecommandModal({ onClose }) {
  const allCommands = useMemo(() => loadAllCommands(), []);
  const [cmdId, setCmdId] = useState(allCommands[0]?.id || '');
  const cmd = useMemo(
    () => allCommands.find((c) => c.id === cmdId) || allCommands[0],
    [cmdId, allCommands],
  );

  // Param state — resets when command changes
  const [paramValues, setParamValues] = useState({});
  useEffect(() => {
    if (!cmd) return;
    setParamValues(
      Object.fromEntries(cmd.params.map((p) => [p.name, p.type === 'str' ? '' : 0])),
    );
  }, [cmd]);

  // Pipeline outputs at each stage
  const [stages, setStages] = useState({});
  const [sessionKey, setSessionKey] = useState(null);
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);

  const appendLog = useCallback((level, msg) => {
    const t = new Date().toISOString().slice(11, 19);
    setLog((cur) => [...cur, { t, level, msg }]);
  }, []);

  // Load / generate the session AES key once.
  useEffect(() => {
    ensureSessionKey().then(({ key, raw, fresh }) => {
      setSessionKey({ key, raw });
      appendLog('info', `Session key ${fresh ? 'generated' : 'loaded'} — AES-256-GCM (${raw.length} B)`);
    }).catch((e) => appendLog('alarm', `Key init failed: ${e.message}`));
  }, [appendLog]);

  // Recompute through stages 1→3 whenever inputs change. The encrypt
  // stage stays manual (button) because each click generates a fresh IV.
  useEffect(() => {
    if (!cmd) return;
    try {
      const encoded = encodeParams(cmd.params, paramValues);
      const sp = buildSpacePacket({
        apid: cmd.apid,
        seqCount: stages.spSeqCount ?? 0,
        dataField: encoded.bytes,
      });
      const tcf = buildTCFrame({
        scid: SCID_DEFAULT,
        vcid: VCID_DEFAULT,
        frameSeq: stages.frameSeq ?? 0,
        dataField: sp.bytes,
      });
      setStages((cur) => ({
        ...cur,
        params: encoded,
        spacePacket: sp,
        tcFrame: tcf,
        encrypted: null,            // invalidate any prior encryption
      }));
    } catch (e) {
      setStages((cur) => ({ ...cur, error: e.message }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmd, paramValues]);

  const encryptStep = useCallback(async () => {
    if (!sessionKey?.key || !stages.tcFrame) return;
    setBusy(true);
    try {
      const aad = stages.spacePacket.header;
      const enc = await aesGcmEncrypt(sessionKey.key, stages.tcFrame.bytes, aad);
      setStages((cur) => ({ ...cur, encrypted: enc }));
      appendLog('info', `Encrypted ${stages.tcFrame.bytes.length} B → ${enc.ciphertext.length} B ciphertext + 16 B tag`);
    } catch (e) {
      appendLog('alarm', `Encrypt failed: ${e.message}`);
    }
    setBusy(false);
  }, [sessionKey, stages, appendLog]);

  const uplinkStep = useCallback(async () => {
    if (!stages.encrypted) return;
    const seq = nextSeq();
    const apid = cmd.apid;
    setBusy(true);
    appendLog('info', `Queued APID ${apid} seq ${seq} (${cmd.mnemonic})`);
    // Simulated uplink + ACK delays — long enough to read, short enough
    // not to feel like fake animation.
    await new Promise((r) => setTimeout(r, 350));
    appendLog('info', `Uplinked: ${stages.encrypted.ciphertext.length + 16} B over TC-VCID ${VCID_DEFAULT}`);
    await new Promise((r) => setTimeout(r, 450));
    appendLog('ok', `ACK received · APID ${apid} seq ${seq}`);
    setStages((cur) => ({
      ...cur,
      spSeqCount: ((cur.spSeqCount ?? 0) + 1) & 0x3FFF,
      frameSeq: ((cur.frameSeq ?? 0) + 1) & 0xFF,
    }));
    setBusy(false);
  }, [stages, cmd, appendLog]);

  const onParamChange = useCallback((name, value) => {
    setParamValues((cur) => ({ ...cur, [name]: value }));
  }, []);

  return (
    <div className="tc-modal-scrim" onClick={onClose}>
      <div className="tc-modal" onClick={(e) => e.stopPropagation()}>
        <header className="tc-modal-head">
          <span className="tc-modal-title">Telecommand · build → packetise → encrypt → uplink</span>
          <button className="tc-close" onClick={onClose}><X size={14} /></button>
        </header>

        <div className="tc-modal-body">
          {/* ── Stage 1: Builder ──────────────────────────── */}
          <section className="tc-stage">
            <header className="tc-stage-head">
              <span className="tc-stage-idx">1</span>
              <span>Command builder</span>
            </header>
            <div className="tc-builder">
              <label className="tc-param-row">
                <span className="tc-param-name">Command</span>
                <select className="tc-input"
                        value={cmdId}
                        onChange={(e) => setCmdId(e.target.value)}>
                  {allCommands.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.mnemonic} (APID {c.apid})
                    </option>
                  ))}
                </select>
              </label>
              {cmd && (
                <>
                  <div className="tc-cmd-desc">{cmd.description}</div>
                  {cmd.params.map((p) => (
                    <ParamField key={p.name} p={p}
                                value={paramValues[p.name]}
                                onChange={onParamChange} />
                  ))}
                </>
              )}
            </div>
          </section>

          {/* ── Stage 2: Space Packet ─────────────────────── */}
          <section className="tc-stage">
            <header className="tc-stage-head">
              <span className="tc-stage-idx">2</span>
              <span>CCSDS Space Packet (133.0-B-2)</span>
              <span className="tc-stage-tag mono">primary header 6 B</span>
            </header>
            {stages.spacePacket && (
              <div className="tc-stage-body">
                <FieldList fields={stages.spacePacket.fields} />
                <HexBytes label="header" bytes={stages.spacePacket.header} color="#6b8fb5" />
                <HexBytes label="full packet" bytes={stages.spacePacket.bytes} color="#c8c8d0" />
              </div>
            )}
          </section>

          {/* ── Stage 3: TC Transfer Frame ────────────────── */}
          <section className="tc-stage">
            <header className="tc-stage-head">
              <span className="tc-stage-idx">3</span>
              <span>TC Transfer Frame (232.0-B-4)</span>
              <span className="tc-stage-tag mono">CRC-16-CCITT trailer</span>
            </header>
            {stages.tcFrame && (
              <div className="tc-stage-body">
                <FieldList fields={stages.tcFrame.fields} />
                <HexBytes label="header" bytes={stages.tcFrame.header} color="#6b8fb5" />
                <HexBytes label="full frame" bytes={stages.tcFrame.bytes} color="#c8c8d0" />
              </div>
            )}
          </section>

          {/* ── Stage 4: Encrypt ──────────────────────────── */}
          <section className="tc-stage">
            <header className="tc-stage-head">
              <span className="tc-stage-idx">4</span>
              <Shield size={11} />
              <span>AES-256-GCM (Web Crypto · SDLS-style)</span>
              <button className="tc-stage-btn"
                      disabled={!sessionKey || busy}
                      onClick={encryptStep}>
                {busy ? <Loader2 size={11} /> : <Key size={11} />}
                Encrypt
              </button>
            </header>
            {stages.encrypted ? (
              <div className="tc-stage-body">
                <HexBytes label="IV (12 B)"        bytes={stages.encrypted.iv}        color="#c6a04e" />
                <HexBytes label="ciphertext"       bytes={stages.encrypted.ciphertext} color="#c8c8d0" />
                <HexBytes label="auth tag (16 B)"  bytes={stages.encrypted.tag}       color="#5e9e74" />
              </div>
            ) : (
              <div className="tc-empty">
                Press <strong>Encrypt</strong> to apply AES-GCM. A fresh 96-bit IV is generated each time;
                the primary header is bound as AAD.
              </div>
            )}
          </section>

          {/* ── Stage 5: Uplink ───────────────────────────── */}
          <section className="tc-stage">
            <header className="tc-stage-head">
              <span className="tc-stage-idx">5</span>
              <Hash size={11} />
              <span>Uplink (simulated)</span>
              <button className="tc-stage-btn tc-stage-btn-primary"
                      disabled={!stages.encrypted || busy}
                      onClick={uplinkStep}>
                <Send size={11} /> Send
              </button>
            </header>
            <ul className="tc-log">
              {log.length === 0 && <li className="tc-empty">Mission log empty — fire the pipeline.</li>}
              {log.map((e, i) => (
                <li key={i} className={`tc-log-row tc-log-${e.level}`}>
                  <span className="tc-log-t mono">{e.t}</span>
                  <span className="tc-log-msg">{e.msg}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
