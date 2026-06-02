/*
 * Panel registry — the single place panels are declared.
 *
 * To add a new panel: write the component, import it, add one entry
 * here. The catalog and the workspace pick it up automatically.
 *
 * Each entry:
 *   type        — stable id used in persisted layouts
 *   title       — header label (sentence case)
 *   description — one line shown in the catalog
 *   component   — the React component
 *   defaultSize — initial grid footprint { w, h } (12-col grid)
 *   nopad       — true for visualizers that paint to the panel edge
 */

import {
  LiveTelemetryPanel,
  SubsystemStatusPanel,
  PowerBatteryPanel,
  LinkStatusPanel,
  MissionClockPanel,
} from './DataPanels';
import {
  CommandStackPanel,
  EventLogPanel,
  GroundContactsPanel,
} from './OpsPanels';
import { Globe3DPanel, GroundTrack2DPanel } from './VizPanels';

export const PANEL_REGISTRY = {
  'live-telemetry': {
    type: 'live-telemetry',
    title: 'Live telemetry',
    description: 'Parameters with values, units and limit state',
    component: LiveTelemetryPanel,
    defaultSize: { w: 4, h: 8 },
  },
  'subsystem-status': {
    type: 'subsystem-status',
    title: 'Subsystem status',
    description: 'Power, thermal, ADCS, comms, OBC, payload',
    component: SubsystemStatusPanel,
    defaultSize: { w: 4, h: 5 },
  },
  'command-stack': {
    type: 'command-stack',
    title: 'Command stack',
    description: 'Queue, send and command history',
    component: CommandStackPanel,
    defaultSize: { w: 4, h: 8 },
  },
  'event-log': {
    type: 'event-log',
    title: 'Event log',
    description: 'Timestamped events, warnings and alarms',
    component: EventLogPanel,
    defaultSize: { w: 4, h: 7 },
  },
  'ground-contacts': {
    type: 'ground-contacts',
    title: 'Ground contacts',
    description: 'Upcoming passes and contact windows',
    component: GroundContactsPanel,
    defaultSize: { w: 4, h: 6 },
  },
  'ground-track': {
    type: 'ground-track',
    title: '2D ground track',
    description: 'Equirectangular map with the orbit track',
    component: GroundTrack2DPanel,
    defaultSize: { w: 6, h: 8 },
    nopad: true,
  },
  'globe-3d': {
    type: 'globe-3d',
    title: '3D globe',
    description: 'Contained 3D view of the orbit',
    component: Globe3DPanel,
    defaultSize: { w: 5, h: 8 },
    nopad: true,
  },
  'power-battery': {
    type: 'power-battery',
    title: 'Power & battery',
    description: 'State of charge, voltage and solar input',
    component: PowerBatteryPanel,
    defaultSize: { w: 3, h: 6 },
  },
  'link-status': {
    type: 'link-status',
    title: 'Link status & SNR',
    description: 'Link state, signal-to-noise and ground station',
    component: LinkStatusPanel,
    defaultSize: { w: 3, h: 6 },
  },
  'mission-clock': {
    type: 'mission-clock',
    title: 'Mission clock & pass timer',
    description: 'UTC clock and countdown to next pass',
    component: MissionClockPanel,
    defaultSize: { w: 3, h: 5 },
  },
};

export const PANEL_LIST = Object.values(PANEL_REGISTRY);
