import { useState, useCallback } from 'react';
import { X, Plus, Trash2, Save } from 'lucide-react';
import {
  loadPacketDefs, savePacketDefs,
  loadCustomCommands, saveCustomCommands,
  FIELD_TYPES, defaultLengthFor,
} from './catalog';

/*
 * PacketDefinitionsModal — operator authors packet structures (TC & TM)
 * and custom commands. Stored in localStorage. The Telecommand modal
 * reads from the same catalog so a definition added here is
 * immediately available in the builder dropdown.
 */

function FieldEditor({ field, onChange, onRemove }) {
  return (
    <div className="tc-fe-row">
      <input className="tc-input mono" value={field.name}
             placeholder="field_name"
             onChange={(e) => onChange({ ...field, name: e.target.value })} />
      <select className="tc-input"
              value={field.type}
              onChange={(e) => {
                const t = e.target.value;
                onChange({ ...field, type: t, length_bytes: defaultLengthFor(t) });
              }}>
        {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <input className="tc-input mono" type="number" min={1} max={64}
             value={field.length_bytes}
             onChange={(e) => onChange({ ...field, length_bytes: parseInt(e.target.value, 10) || 1 })} />
      <button className="tc-icon-btn" onClick={onRemove} title="Remove">
        <Trash2 size={11} />
      </button>
    </div>
  );
}

function PacketCard({ def, onUpdate, onRemove }) {
  const update = useCallback((patch) => onUpdate({ ...def, ...patch }), [def, onUpdate]);
  const addField = useCallback(() => {
    update({
      fields: [...def.fields, { name: `field_${def.fields.length}`, type: 'u8', length_bytes: 1 }],
    });
  }, [def, update]);
  const updateField = useCallback((i, f) => {
    const copy = [...def.fields];
    copy[i] = f;
    update({ fields: copy });
  }, [def, update]);
  const removeField = useCallback((i) => {
    update({ fields: def.fields.filter((_, j) => j !== i) });
  }, [def, update]);

  const totalBytes = def.fields.reduce((s, f) => s + (f.length_bytes || 0), 0);

  return (
    <div className="tc-def-card">
      <div className="tc-def-row">
        <select className="tc-input tc-def-kind" value={def.kind}
                onChange={(e) => update({ kind: e.target.value })}>
          <option value="tc">TC (uplink)</option>
          <option value="tm">TM (downlink)</option>
        </select>
        <input className="tc-input" value={def.name} placeholder="MNEMONIC"
               onChange={(e) => update({ name: e.target.value })} />
        <label className="tc-def-apid mono">
          APID
          <input className="tc-input mono" type="number" min={0} max={2047}
                 value={def.apid}
                 onChange={(e) => update({ apid: parseInt(e.target.value, 10) || 0 })} />
        </label>
        <span className="tc-def-len mono">{totalBytes} B</span>
        <button className="tc-icon-btn" onClick={onRemove} title="Delete definition">
          <Trash2 size={11} />
        </button>
      </div>
      <div className="tc-def-fields">
        {def.fields.map((f, i) => (
          <FieldEditor key={i} field={f}
                       onChange={(nf) => updateField(i, nf)}
                       onRemove={() => removeField(i)} />
        ))}
        <button className="tc-secondary" onClick={addField}>
          <Plus size={11} /> Add field
        </button>
      </div>
    </div>
  );
}

export default function PacketDefinitionsModal({ onClose }) {
  const [defs, setDefs] = useState(() => loadPacketDefs());
  const [dirty, setDirty] = useState(false);

  const update = useCallback((i, patched) => {
    setDefs((cur) => cur.map((d, idx) => (idx === i ? patched : d)));
    setDirty(true);
  }, []);

  const add = useCallback(() => {
    setDefs((cur) => [
      ...cur,
      {
        id: `def_${Date.now().toString(36)}`,
        kind: 'tc',
        name: 'NEW_CMD',
        apid: 300 + cur.length,
        fields: [{ name: 'arg', type: 'u8', length_bytes: 1 }],
      },
    ]);
    setDirty(true);
  }, []);

  const remove = useCallback((i) => {
    setDefs((cur) => cur.filter((_, idx) => idx !== i));
    setDirty(true);
  }, []);

  const save = useCallback(() => {
    savePacketDefs(defs);
    // Mirror TC-kind definitions into the command catalog so the
    // Telecommand modal's builder picks them up.
    const tcCommands = defs
      .filter((d) => d.kind === 'tc' && d.name && d.fields.length > 0)
      .map((d) => ({
        id: d.id,
        mnemonic: d.name.toUpperCase(),
        apid: d.apid,
        description: 'Operator-defined command',
        params: d.fields.map((f) => ({
          name: f.name,
          type: f.type,
          length_bytes: f.length_bytes,
        })),
      }));
    saveCustomCommands(tcCommands);
    setDirty(false);
  }, [defs]);

  return (
    <div className="tc-modal-scrim" onClick={onClose}>
      <div className="tc-modal tc-modal-narrow" onClick={(e) => e.stopPropagation()}>
        <header className="tc-modal-head">
          <span className="tc-modal-title">Packet definitions · TM & TC structures</span>
          <button className="tc-close" onClick={onClose}><X size={14} /></button>
        </header>
        <div className="tc-modal-body">
          <div className="tc-def-note">
            Each definition is a named packet structure. TC definitions also become
            commands in the telecommand builder; TM definitions drive the live
            telemetry decoder.
          </div>
          {defs.length === 0 && (
            <div className="tc-empty">No definitions yet. Add one to get started.</div>
          )}
          {defs.map((d, i) => (
            <PacketCard key={d.id} def={d}
                        onUpdate={(p) => update(i, p)}
                        onRemove={() => remove(i)} />
          ))}
          <div className="tc-def-actions">
            <button className="tc-secondary" onClick={add}>
              <Plus size={11} /> Add definition
            </button>
            <button className="tc-stage-btn tc-stage-btn-primary"
                    disabled={!dirty} onClick={save}>
              <Save size={11} /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
