import CesiumGlobe from '../../CesiumGlobe';
import GroundTrack2D from '../../GroundTrack2D';

/*
 * Visualizer panels. The 2D map and 3D globe are panels like any other —
 * contained, never full-bleed. They reuse the existing CesiumGlobe and
 * GroundTrack2D components, held inside a bounded panel body.
 */

export function Globe3DPanel({ telemetry }) {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <CesiumGlobe telemetry={telemetry} />
    </div>
  );
}

export function GroundTrack2DPanel({ telemetry }) {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <GroundTrack2D telemetry={telemetry} />
    </div>
  );
}
