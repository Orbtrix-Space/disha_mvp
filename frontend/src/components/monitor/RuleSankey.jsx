import { useEffect, useMemo, useRef, useState } from 'react';

/*
 * RuleSankey — sensor → constraint → decision → action.
 *
 * Custom SVG (Recharts has no native Sankey). Layout: 4 vertical
 * columns; node heights proportional to sum of incoming flow widths;
 * gentle Bézier links coloured by source layer.
 *
 * Backend payload:
 *   nodes: [{ layer, id }]   layer ∈ subsystem|rule|mode|action
 *   links: [{ source_layer, source, target_layer, target, value }]
 */

const LAYERS = ['subsystem', 'rule', 'mode', 'action'];
const LAYER_LABEL = {
  subsystem: 'SENSOR', rule: 'CONSTRAINT', mode: 'DECISION', action: 'ACTION',
};
const COLORS = {
  subsystem: '#4a6f93',
  rule:      '#b39148',
  mode:      '#7e7e87',
  action:    '#6b9c7c',
};

const PADDING = 14;
const NODE_W  = 8;
const NODE_GAP = 6;

export default function RuleSankey({ nodes = [], links = [] }) {
  const wrapRef = useRef(null);
  const [box, setBox] = useState({ w: 720, h: 240 });

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      setBox({
        w: Math.max(420, e.contentRect.width),
        h: Math.max(180, e.contentRect.height),
      });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    // Group nodes by layer
    const byLayer = {};
    LAYERS.forEach((l) => { byLayer[l] = []; });
    nodes.forEach((n) => {
      if (byLayer[n.layer]) byLayer[n.layer].push({ ...n, in: 0, out: 0 });
    });
    // Compute per-node weights (sum of incoming + outgoing values)
    links.forEach((l) => {
      const sNode = byLayer[l.source_layer]?.find((x) => x.id === l.source);
      const tNode = byLayer[l.target_layer]?.find((x) => x.id === l.target);
      if (sNode) sNode.out += l.value;
      if (tNode) tNode.in  += l.value;
    });
    LAYERS.forEach((l) => {
      byLayer[l].forEach((n) => { n.weight = Math.max(n.in, n.out, 1); });
      // Sort by weight desc
      byLayer[l].sort((a, b) => b.weight - a.weight);
    });

    // Y-position nodes per layer proportionally
    const plotH = box.h - PADDING * 2;
    const colXs = LAYERS.map((_, i) =>
      PADDING + (box.w - PADDING * 2 - NODE_W) * (i / (LAYERS.length - 1))
    );
    const placed = {};
    LAYERS.forEach((layer, li) => {
      const items = byLayer[layer];
      const sum = items.reduce((s, n) => s + n.weight, 0) || 1;
      const available = plotH - NODE_GAP * Math.max(0, items.length - 1);
      let y = PADDING;
      items.forEach((n) => {
        const h = Math.max(6, available * (n.weight / sum));
        placed[`${layer}:${n.id}`] = {
          ...n, x: colXs[li], y, h, layer,
        };
        y += h + NODE_GAP;
      });
    });

    // Build link paths — Bézier from source right edge to target left edge.
    // Multiple links from the same node stack within its vertical extent.
    const srcOffsets = {};
    const tgtOffsets = {};
    const paths = links.map((l) => {
      const s = placed[`${l.source_layer}:${l.source}`];
      const t = placed[`${l.target_layer}:${l.target}`];
      if (!s || !t) return null;
      const sKey = `${l.source_layer}:${l.source}`;
      const tKey = `${l.target_layer}:${l.target}`;
      // Width on each side proportional to link value vs node weight
      const sw = Math.max(1, s.h * (l.value / Math.max(1, s.out || 1)));
      const tw = Math.max(1, t.h * (l.value / Math.max(1, t.in  || 1)));
      const sStart = (srcOffsets[sKey] = (srcOffsets[sKey] || 0));
      const tStart = (tgtOffsets[tKey] = (tgtOffsets[tKey] || 0));
      srcOffsets[sKey] += sw;
      tgtOffsets[tKey] += tw;
      const x1 = s.x + NODE_W, y1Top = s.y + sStart, y1Bot = y1Top + sw;
      const x2 = t.x,          y2Top = t.y + tStart, y2Bot = y2Top + tw;
      const midX = (x1 + x2) / 2;
      const dTop = `M ${x1} ${y1Top} C ${midX} ${y1Top}, ${midX} ${y2Top}, ${x2} ${y2Top}`;
      const dBot = `L ${x2} ${y2Bot} C ${midX} ${y2Bot}, ${midX} ${y1Bot}, ${x1} ${y1Bot} Z`;
      return {
        d: dTop + ' ' + dBot,
        color: COLORS[l.source_layer],
        value: l.value, source: l.source, target: l.target,
      };
    }).filter(Boolean);

    return { byLayer, placed, paths, colXs };
  }, [nodes, links, box]);

  if (!nodes.length || !links.length) {
    return (
      <div className="mon-empty">
        Sankey populates after rules fire — let the tick loop run a few
        minutes.
      </div>
    );
  }

  return (
    <div className="mon-sankey-wrap" ref={wrapRef}>
      <svg width="100%" height="100%" viewBox={`0 0 ${box.w} ${box.h}`}>
        {/* Column headers */}
        {LAYERS.map((l, i) => (
          <text key={l} x={layout.colXs[i]} y={11}
                fill="#7e7e87" fontFamily="Poppins, sans-serif"
                fontSize="9" letterSpacing="0.06em">
            {LAYER_LABEL[l]}
          </text>
        ))}

        {/* Links — drawn first so nodes paint on top */}
        {layout.paths.map((p, i) => (
          <path key={i} d={p.d} fill={p.color} fillOpacity="0.18"
                stroke={p.color} strokeOpacity="0.40" strokeWidth="0.6">
            <title>{p.source} → {p.target} · {p.value}</title>
          </path>
        ))}

        {/* Nodes */}
        {Object.values(layout.placed).map((n) => (
          <g key={`${n.layer}:${n.id}`}>
            <rect x={n.x} y={n.y} width={NODE_W} height={n.h}
                  fill={COLORS[n.layer]} fillOpacity="0.85" />
            <text x={n.x + NODE_W + 4} y={n.y + n.h / 2 + 3}
                  fill="#c8c8cc"
                  fontFamily="Poppins, sans-serif" fontSize="9.5"
                  textRendering="optimizeLegibility">
              {n.id}
              <tspan fill="#7e7e87" dx="6"
                     fontSize="8.5">{n.weight}</tspan>
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
