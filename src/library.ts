// Fastener catalogue. Dimensions are nominal values from the ISO tables,
// good enough for illustrative (not-to-scale) drawings.

export const SIZES = ['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8', 'M10', 'M12'] as const;
export type Size = (typeof SIZES)[number];

export interface SizeData {
  d: number; // nominal diameter
  P: number; // coarse pitch
  clearance: number; // ISO 273 medium clearance hole
  hexS: number; // across flats, hex nuts and hex heads
  nutM: number; // ISO 4032 nut height
  nylocH: number; // ISO 7040 nut height
  shcs: [dk: number, k: number];
  hexK: number;
  button: [dk: number, k: number];
  cskDk: number;
  pan: [dk: number, k: number];
  washer: [d1: number, d2: number, h: number]; // ISO 7089
  large: [d1: number, d2: number, h: number]; // ISO 7093
}

type Row = [
  d: number, P: number, cl: number, hexS: number, nutM: number, nylocH: number,
  shcsDk: number, shcsK: number, hexK: number, btnDk: number, btnK: number,
  cskDk: number, panDk: number, panK: number,
  w1: number, w2: number, wh: number, l1: number, l2: number, lh: number,
];

const ROWS: Record<Size, Row> = {
  M2: [2, 0.4, 2.4, 4, 1.6, 2.8, 3.8, 2, 1.4, 3.5, 1.3, 4.4, 4, 1.6, 2.2, 5, 0.3, 2.2, 6, 0.5],
  'M2.5': [2.5, 0.45, 2.9, 5, 2, 3.2, 4.5, 2.5, 1.7, 4.7, 1.5, 5.5, 5, 1.75, 2.7, 6, 0.5, 2.7, 8, 0.6],
  M3: [3, 0.5, 3.4, 5.5, 2.4, 4, 5.5, 3, 2, 5.7, 1.65, 6.72, 5.6, 2.1, 3.2, 7, 0.5, 3.2, 9, 0.8],
  M4: [4, 0.7, 4.5, 7, 3.2, 5, 7, 4, 2.8, 7.6, 2.2, 8.96, 8, 2.8, 4.3, 9, 0.8, 4.3, 12, 1],
  M5: [5, 0.8, 5.5, 8, 4.7, 5, 8.5, 5, 3.5, 9.5, 2.75, 11.2, 9.5, 3.5, 5.3, 10, 1, 5.3, 15, 1.2],
  M6: [6, 1, 6.6, 10, 5.2, 6, 10, 6, 4, 10.5, 3.3, 13.44, 12, 4.2, 6.4, 12, 1.6, 6.4, 18, 1.6],
  M8: [8, 1.25, 9, 13, 6.8, 8, 13, 8, 5.3, 14, 4.4, 17.92, 16, 5.6, 8.4, 16, 1.6, 8.4, 24, 2],
  M10: [10, 1.5, 11, 16, 8.4, 10, 16, 10, 6.4, 17.5, 5.5, 22.4, 20, 7, 10.5, 20, 2, 10.5, 30, 2.5],
  M12: [12, 1.75, 13.5, 18, 10.8, 12, 18, 12, 7.5, 21, 6.6, 26.88, 24, 8.4, 13, 24, 2.5, 13, 37, 3],
};

export function sizeData(size: Size): SizeData {
  const r = ROWS[size];
  return {
    d: r[0], P: r[1], clearance: r[2], hexS: r[3], nutM: r[4], nylocH: r[5],
    shcs: [r[6], r[7]], hexK: r[8], button: [r[9], r[10]], cskDk: r[11], pan: [r[12], r[13]],
    washer: [r[14], r[15], r[16]], large: [r[17], r[18], r[19]],
  };
}

interface ExtraData {
  thinM: number; // ISO 4035 thin nut height
  flange: [dc: number, m: number, c: number]; // EN 1661 flange nut: flange Ø, height, flange thickness
  domeH: number; // DIN 1587 dome nut overall height
  spring: [d1: number, d2: number, s: number]; // DIN 127 B spring washer
  insert: [od: number, len: number]; // typical heat-set insert for plastic
}

const EXTRA: Record<Size, ExtraData> = {
  M2: { thinM: 1.2, flange: [5, 2.4, 0.6], domeH: 4, spring: [2.1, 4.4, 0.5], insert: [3.2, 3] },
  'M2.5': { thinM: 1.6, flange: [6, 2.8, 0.7], domeH: 5, spring: [2.6, 5.1, 0.6], insert: [3.8, 3.5] },
  M3: { thinM: 1.8, flange: [7.5, 3.5, 0.8], domeH: 6, spring: [3.1, 6.2, 0.8], insert: [4.6, 4] },
  M4: { thinM: 2.2, flange: [9.7, 4.5, 0.9], domeH: 8, spring: [4.1, 7.6, 0.9], insert: [5.6, 5] },
  M5: { thinM: 2.7, flange: [11.8, 5, 1], domeH: 10, spring: [5.1, 9.2, 1.2], insert: [6.4, 6] },
  M6: { thinM: 3.2, flange: [14.2, 6, 1.1], domeH: 12, spring: [6.1, 11.8, 1.6], insert: [8, 8] },
  M8: { thinM: 4, flange: [17.9, 8, 1.2], domeH: 15, spring: [8.1, 14.8, 2], insert: [10, 10] },
  M10: { thinM: 5, flange: [21.8, 10, 1.5], domeH: 18, spring: [10.2, 18.1, 2.2], insert: [12.5, 12] },
  M12: { thinM: 6, flange: [26, 12, 1.8], domeH: 22, spring: [12.2, 21.1, 2.5], insert: [15, 14] },
};

export const extraData = (size: Size): ExtraData => EXTRA[size];

export const STD_LENGTHS = [
  3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100,
];

interface CatalogueEntry { name: string; short: string; std: string }

export const SCREW_TYPES = {
  shcs: { name: 'Socket head cap screw', short: 'socket cap screw', std: 'ISO 4762' },
  button: { name: 'Button head socket screw', short: 'button head screw', std: 'ISO 7380' },
  csk: { name: 'Countersunk socket screw', short: 'countersunk screw', std: 'ISO 10642' },
  pan: { name: 'Pan head screw, Pozi', short: 'pan head screw', std: 'ISO 7045' },
  hex: { name: 'Hex head screw', short: 'hex head screw', std: 'ISO 4017' },
  set: { name: 'Set screw, flat point', short: 'set screw', std: 'ISO 4026' },
} satisfies Record<string, CatalogueEntry>;
export type ScrewType = keyof typeof SCREW_TYPES;

export const WASHER_TYPES = {
  plain: { name: 'Plain washer', short: 'plain washer', std: 'ISO 7089' },
  large: { name: 'Large washer', short: 'large washer', std: 'ISO 7093' },
  spring: { name: 'Spring washer', short: 'spring washer', std: 'DIN 127 B' },
} satisfies Record<string, CatalogueEntry>;
export type WasherType = keyof typeof WASHER_TYPES;

export const NUT_TYPES = {
  hex: { name: 'Hex nut', short: 'hex nut', std: 'ISO 4032' },
  nyloc: { name: 'Nyloc nut', short: 'nyloc nut', std: 'ISO 7040' },
  thin: { name: 'Thin hex nut', short: 'thin nut', std: 'ISO 4035' },
  flange: { name: 'Flange nut', short: 'flange nut', std: 'EN 1661' },
  dome: { name: 'Dome nut', short: 'dome nut', std: 'DIN 1587' },
} satisfies Record<string, CatalogueEntry>;
export type NutType = keyof typeof NUT_TYPES;

// Clamped-part materials. `spacing` is the hatch pitch in px; `thickness` the default in mm.
export const MATERIALS = {
  'sheet-metal': { name: 'Sheet metal', spacing: 5, thickness: 1.5 },
  pcb: { name: 'PCB', spacing: 3.5, thickness: 1.6 },
  plastic: { name: 'Plastic', spacing: 8, thickness: 3 },
  other: { name: 'Part', spacing: 6, thickness: 2 },
} as const;
export type MaterialType = keyof typeof MATERIALS;

export function headDims(type: ScrewType, sd: SizeData): { dk: number; k: number } {
  switch (type) {
    case 'shcs': return { dk: sd.shcs[0], k: sd.shcs[1] };
    case 'hex': return { dk: sd.hexS * HEX_CORNER, k: sd.hexK };
    case 'button': return { dk: sd.button[0], k: sd.button[1] };
    case 'pan': return { dk: sd.pan[0], k: sd.pan[1] };
    case 'csk': return { dk: sd.cskDk, k: (sd.cskDk - sd.d) / 2 }; // 90° countersink
    case 'set': return { dk: sd.d, k: 0 }; // headless
  }
}

/** Across-corners / across-flats ratio for a hexagon. */
export const HEX_CORNER = 2 / Math.sqrt(3);

/** Washer [inner Ø, outer Ø, thickness]. Spring washers are taken as compressed flat. */
export function washerDims(type: WasherType, size: Size): [number, number, number] {
  const sd = sizeData(size);
  if (type === 'plain') return sd.washer;
  if (type === 'large') return sd.large;
  return extraData(size).spring;
}

export function nutHeight(type: NutType, size: Size): number {
  const sd = sizeData(size), ex = extraData(size);
  switch (type) {
    case 'hex': return sd.nutM;
    case 'nyloc': return sd.nylocH;
    case 'thin': return ex.thinM;
    case 'flange': return ex.flange[1];
    case 'dome': return ex.domeH;
  }
}

/** Outer radius of a nut as drawn (hex across corners, or flange). */
export function nutRadius(type: NutType, size: Size): number {
  const r = (sizeData(size).hexS * HEX_CORNER) / 2;
  return type === 'flange' ? Math.max(r, extraData(size).flange[0] / 2) : r;
}
