/**
 * PopupPanel — Reusable maximize/popup wrapper for any panel.
 *
 * Usage: <PopupPanel title="3D GLOBE"><CesiumGlobe ... /></PopupPanel>
 *
 * Shows a small maximize icon in the top-right corner.
 * When clicked, the panel content renders in a full-screen overlay.
 * Press Escape or click the close button to return.
 */

import { useState, useCallback, useEffect } from 'react';
import { Maximize2, X } from 'lucide-react';
import { createPortal } from 'react-dom';

export default function PopupPanel({ title, children, className = '' }) {
  const [maximized, setMaximized] = useState(false);

  const close = useCallback(() => setMaximized(false), []);

  useEffect(() => {
    if (!maximized) return;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [maximized, close]);

  return (
    <>
      {/* Inline maximize button — sits inside the panel */}
      <button
        className="pp-maximize-btn"
        onClick={() => setMaximized(true)}
        title={`Maximize ${title || ''}`}
      >
        <Maximize2 size={12} />
      </button>

      {/* Full-screen overlay portal */}
      {maximized && createPortal(
        <div className="pp-overlay" onClick={close}>
          <div className={`pp-modal ${className}`} onClick={(e) => e.stopPropagation()}>
            <div className="pp-modal-header">
              <span className="pp-modal-title">{title}</span>
              <button className="pp-modal-close" onClick={close}>
                <X size={16} />
              </button>
            </div>
            <div className="pp-modal-body">
              {children}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
