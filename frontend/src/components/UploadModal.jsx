import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Upload, FileText, Check, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

/*
 * UploadModal — overlay for operator-uploaded artifacts.
 *
 * Opens from the sidebar Operations / Insert section. One modal handles
 * any registered upload `kind` (telecommand format, packet definitions,
 * ...). The kind id is the URL path segment on the backend; the title
 * shown comes from `/uploads/kinds`.
 */
export default function UploadModal({ kind, label, onClose }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const inputRef = useRef(null);

  const loadHistory = useCallback(async () => {
    const data = await api.listUploads(kind);
    if (data?.files) setHistory(data.files);
  }, [kind]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const onPick = (f) => {
    setFile(f || null);
    setResult(null);
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    if (e.dataTransfer?.files?.[0]) onPick(e.dataTransfer.files[0]);
  }, []);

  const submit = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    const res = await api.uploadFile(kind, file);
    setBusy(false);
    setResult(res);
    if (res?.ok) {
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      loadHistory();
    }
  }, [file, kind, loadHistory]);

  return (
    <div className="op-modal-scrim" onClick={onClose}>
      <div className="op-modal" onClick={(e) => e.stopPropagation()}>
        <div className="op-modal-head">
          <span>Insert &middot; {label}</span>
          <button className="op-modal-close" onClick={onClose} title="Close">
            <X size={14} />
          </button>
        </div>

        <div className="op-modal-body">
          <div className="op-drop"
               onDragOver={(e) => e.preventDefault()}
               onDrop={onDrop}>
            <Upload size={20} />
            <div className="op-drop-text">
              {file ? (
                <>
                  <strong>{file.name}</strong>
                  <span className="op-drop-meta">{Math.round(file.size / 1024)} KB</span>
                </>
              ) : (
                <>
                  <span>Drop a file here</span>
                  <span className="op-drop-meta">or use the chooser below</span>
                </>
              )}
            </div>
          </div>

          <div className="op-row">
            <input
              ref={inputRef}
              type="file"
              className="op-file"
              onChange={(e) => onPick(e.target.files?.[0])}
            />
            <button className="op-primary" disabled={!file || busy} onClick={submit}>
              {busy ? 'Uploading…' : 'Upload'}
            </button>
          </div>

          {result && (
            <div className={`op-status ${result.ok ? 'ok' : 'err'}`}>
              {result.ok ? <Check size={11} /> : <AlertCircle size={11} />}
              <span>
                {result.ok
                  ? `Saved as ${result.saved_as} (${result.size_bytes} B)`
                  : result.message || 'Upload failed.'}
              </span>
            </div>
          )}

          <div className="op-section-head">
            <FileText size={11} />
            <span>Previously uploaded</span>
          </div>
          {history.length === 0 ? (
            <div className="op-empty">No prior uploads.</div>
          ) : (
            <ul className="op-list">
              {history.map((f) => (
                <li key={f.saved_as} className="op-list-item">
                  <span className="op-list-name">{f.saved_as}</span>
                  <span className="op-list-meta">
                    {Math.round(f.size_bytes / 1024)} KB
                    &nbsp;&middot;&nbsp;
                    {f.mtime.slice(11, 19)} UTC
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
