import { X } from 'lucide-react';
import { PANEL_LIST } from './panels/registry';

/*
 * PanelCatalog — modal listing every registered panel. Clicking one
 * attaches it to the workspace. Extensible by definition: it renders
 * whatever is in the registry.
 */
export default function PanelCatalog({ onPick, onClose }) {
  return (
    <div className="c3-modal-scrim" onClick={onClose}>
      <div className="c3-modal" onClick={(e) => e.stopPropagation()}>
        <div className="c3-modal-head">
          <span>Add panel</span>
          <button className="c3-panel-act" style={{ marginLeft: 'auto' }} onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <div className="c3-catalog">
          {PANEL_LIST.map((p) => (
            <button key={p.type} className="c3-cat-item"
                    onClick={() => { onPick(p.type); onClose(); }}>
              <div className="name">{p.title}</div>
              <div className="desc">{p.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
