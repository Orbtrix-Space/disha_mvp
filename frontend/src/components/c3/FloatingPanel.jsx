import { useRef, useCallback } from 'react';
import { Minimize2, X } from 'lucide-react';

/*
 * FloatingPanel — a panel popped out of the grid into a free window.
 * It sits over the workspace so a heavy panel (e.g. the 3D globe) does
 * not consume a grid cell. Draggable by the header, resizable from the
 * bottom-right corner. Geometry is reported back via onChange so it
 * persists with the rest of the layout.
 */
export default function FloatingPanel({ def, float, onChange, onDock, onClose, children }) {
  const ref = useRef(null);

  const startDrag = useCallback((e) => {
    e.preventDefault();
    const ox = e.clientX - float.x;
    const oy = e.clientY - float.y;
    const move = (ev) => {
      onChange({ ...float, x: Math.max(0, ev.clientX - ox), y: Math.max(40, ev.clientY - oy) });
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, [float, onChange]);

  const startResize = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    const sw = float.w;
    const sh = float.h;
    const move = (ev) => {
      onChange({
        ...float,
        w: Math.max(240, sw + (ev.clientX - sx)),
        h: Math.max(160, sh + (ev.clientY - sy)),
      });
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, [float, onChange]);

  return (
    <div ref={ref} className="c3-float"
         style={{ left: float.x, top: float.y, width: float.w, height: float.h }}>
      <div className="c3-panel-head" onMouseDown={startDrag}>
        <span className="c3-panel-title">{def.title}</span>
        <button className="c3-panel-act" title="Dock back to grid"
                onMouseDown={(e) => e.stopPropagation()} onClick={onDock}>
          <Minimize2 size={12} />
        </button>
        <button className="c3-panel-act" title="Close"
                onMouseDown={(e) => e.stopPropagation()} onClick={onClose}>
          <X size={13} />
        </button>
      </div>
      <div className={`c3-panel-body ${def.nopad ? 'nopad' : ''}`}
           style={def.nopad ? { position: 'relative' } : undefined}>
        {children}
      </div>
      <div className="c3-float-resize" onMouseDown={startResize} />
    </div>
  );
}
