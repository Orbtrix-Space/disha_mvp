import { ExternalLink, X } from 'lucide-react';

/*
 * PanelFrame — the chrome around every panel: a draggable header with
 * the title, a pop-out control and a close control. The body hosts the
 * panel component. The header doubles as the react-grid-layout drag
 * handle (class c3-panel-drag).
 */
export default function PanelFrame({ def, onPopOut, onClose, children }) {
  return (
    <div className="c3-panel">
      <div className="c3-panel-head c3-panel-drag">
        <span className="c3-panel-title">{def.title}</span>
        <button className="c3-panel-act" title="Pop out"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={onPopOut}>
          <ExternalLink size={12} />
        </button>
        <button className="c3-panel-act" title="Close"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={onClose}>
          <X size={13} />
        </button>
      </div>
      <div className={`c3-panel-body ${def.nopad ? 'nopad' : ''}`}
           style={def.nopad ? { position: 'relative' } : undefined}>
        {children}
      </div>
    </div>
  );
}
