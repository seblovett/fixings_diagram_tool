import {
  MATERIALS, SCREW_TYPES, SIZES, extraData, nutHeight, sizeData, washerDims,
  type MaterialType, type NutType, type ScrewType, type Size, type SizeData, type WasherType,
} from './library';

export interface WasherLayer { id: string; kind: 'washer'; type: WasherType }
export interface NutLayer { id: string; kind: 'nut'; type: NutType }
export interface PartLayer {
  id: string; kind: 'part'; material: MaterialType; thickness: number; label: string;
  hole: 'clearance' | 'tapped';
}
export interface BossLayer {
  id: string; kind: 'boss'; label: string;
  height: number; diameter: number; wall: number; holeDepth: number;
  /** Heat-set threaded insert at the top of the hole, instead of a tapped thread. */
  insert?: boolean;
}
export type Layer = WasherLayer | NutLayer | PartLayer | BossLayer;
export type LayerKind = Layer['kind'];

export interface Joint {
  version: 1;
  name: string;
  screw: { type: ScrewType; size: Size; length: number; auto: boolean };
  fastenerMaterial: string;
  /** Per-BOM-item edits, keyed by item key (see bom.ts). */
  bomOverrides: Record<string, { desc?: string; partNo?: string }>;
  /** Free-text notes, one per line, printed under the drawing. */
  notes: string;
  /** Ordered from under the screw head towards the tip. */
  stack: Layer[];
  options: {
    view: 'section' | 'iso';
    exploded: boolean;
    labels: 'text' | 'balloons' | 'none';
    bom: boolean;
    bomParts: boolean;
    hidden: boolean;
    title: boolean;
    calloutSide: 'right' | 'both';
  };
}

export const newId = () => Math.random().toString(36).slice(2, 9);

export const defaultPartLabel = (m: MaterialType, t: number) => `${MATERIALS[m].name} ${t} mm`;

export function makeLayer(kind: LayerKind, size: Size): Layer {
  const id = newId();
  switch (kind) {
    case 'washer': return { id, kind, type: 'plain' };
    case 'nut': return { id, kind, type: 'hex' };
    case 'part': {
      const t = MATERIALS['sheet-metal'].thickness;
      return { id, kind, material: 'sheet-metal', thickness: t, label: defaultPartLabel('sheet-metal', t), hole: 'clearance' };
    }
    case 'boss': return { id, kind, label: 'Enclosure boss', ...bossDefaults(size) };
  }
}

export function bossDefaults(size: Size) {
  const d = sizeData(size).d;
  const height = Math.round(3 * d);
  return {
    height,
    diameter: Math.max(d + 2, Math.round(2.5 * d * 2) / 2),
    wall: Math.max(2, Math.round(0.8 * d)),
    holeDepth: height,
  };
}

export function layerThickness(l: Layer, size: Size): number {
  switch (l.kind) {
    case 'washer': return washerDims(l.type, size)[2];
    case 'nut': return nutHeight(l.type, size);
    case 'part': return Math.max(0.1, l.thickness);
    case 'boss': return Math.max(0.5, l.height) + Math.max(0.5, l.wall);
  }
}

/** Usable hole depth in a boss (leaves room for the drill point and a floor). */
export function bossHoleDepth(l: BossLayer, sd: SizeData): number {
  const cone = (sd.d / 2) * DRILL_CONE;
  const max = Math.max(0.5, l.height + l.wall - cone - 0.3);
  return Math.min(Math.max(0.5, l.holeDepth), max);
}
/** Heat-set insert dimensions for a boss, or null if it is tapped directly. */
export function bossInsert(l: BossLayer, size: Size): { od: number; len: number } | null {
  if (!l.insert) return null;
  const [od, len] = extraData(size).insert;
  return { od, len: Math.min(len, Math.max(0.5, l.height + l.wall - 0.5)) };
}
/** tan(31°): depth/radius of a 118° drill point. */
export const DRILL_CONE = Math.tan((31 * Math.PI) / 180);

export interface Placed { layer: Layer; y0: number; y1: number }

/** Positions each layer along the screw axis (mm, y=0 under the head). Stops at a boss. */
export function placeStack(j: Joint): Placed[] {
  const out: Placed[] = [];
  let y = 0;
  for (const layer of j.stack) {
    const t = layerThickness(layer, j.screw.size);
    out.push({ layer, y0: y, y1: y + t });
    y += t;
    if (layer.kind === 'boss') break;
  }
  return out;
}

export function defaultJoint(): Joint {
  return {
    version: 1,
    name: 'Joint 1',
    screw: { type: 'shcs', size: 'M3', length: 10, auto: true },
    fastenerMaterial: 'A2 stainless',
    bomOverrides: {},
    notes: '',
    stack: [
      { id: newId(), kind: 'washer', type: 'plain' },
      { id: newId(), kind: 'part', material: 'sheet-metal', thickness: 1.5, label: defaultPartLabel('sheet-metal', 1.5), hole: 'clearance' },
      { id: newId(), kind: 'part', material: 'pcb', thickness: 1.6, label: defaultPartLabel('pcb', 1.6), hole: 'clearance' },
      { id: newId(), kind: 'washer', type: 'plain' },
      { id: newId(), kind: 'nut', type: 'nyloc' },
    ],
    options: { view: 'section', exploded: true, labels: 'balloons', bom: true, bomParts: true, hidden: true, title: false, calloutSide: 'both' },
  };
}

/** Parses a saved design, filling in anything missing with defaults. Throws on garbage. */
export function parseJoint(text: string): Joint {
  const raw = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || raw.version !== 1 || !Array.isArray(raw.stack) || !raw.screw) {
    throw new Error('Not a fixings design file (expected version 1).');
  }
  const def = defaultJoint();
  const screw = { ...def.screw, ...raw.screw };
  if (!SIZES.includes(screw.size) || !(screw.type in SCREW_TYPES)) throw new Error('Unknown screw size or type.');
  return {
    ...def,
    ...raw,
    screw,
    options: { ...def.options, ...raw.options },
    stack: raw.stack.map((l: Layer) => ({ ...l, id: l.id ?? newId() })),
  };
}
