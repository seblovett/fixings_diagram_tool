import { NUT_TYPES, SCREW_TYPES, WASHER_TYPES } from './library';
import { bossInsert, type Joint } from './model';

export interface Item {
  /** Identical parts share a key (and so a BOM row and balloon number). */
  key: string;
  desc: string;
  /** Catalogue description; also the key for user overrides, so an edit or part number
   *  only sticks while the part itself (type, size, length) is unchanged. */
  defaultDesc: string;
  short: string;
  partNo: string;
  material: string;
  qty: number;
  isFastener: boolean;
}

export interface BomRow extends Item { no: number }

/** Every distinct item in the joint, in head-to-tip order. */
export function collectItems(j: Joint): Map<string, Item> {
  const items = new Map<string, Item>();
  const add = (it: Omit<Item, 'qty' | 'defaultDesc' | 'partNo'>) => {
    const existing = items.get(it.key);
    if (existing) { existing.qty++; return; }
    const o = j.bomOverrides[it.desc] ?? {};
    const desc = o.desc?.trim() || it.desc;
    items.set(it.key, {
      ...it, desc, defaultDesc: it.desc, partNo: o.partNo?.trim() ?? '', qty: 1,
      short: desc === it.desc ? it.short : desc,
    });
  };
  const { size, length, type } = j.screw;
  const mat = j.fastenerMaterial.trim();
  const s = SCREW_TYPES[type];
  add({ key: 'screw', desc: `${s.name} ${size} × ${length}, ${s.std}`, short: `${size} × ${length} ${s.short}`, material: mat, isFastener: true });
  for (const l of j.stack) {
    if (l.kind === 'washer') {
      const w = WASHER_TYPES[l.type];
      add({ key: `washer:${l.type}`, desc: `${w.name} ${size}, ${w.std}`, short: `${size} ${w.short}`, material: mat, isFastener: true });
    } else if (l.kind === 'nut') {
      const n = NUT_TYPES[l.type];
      add({ key: `nut:${l.type}`, desc: `${n.name} ${size}, ${n.std}`, short: `${size} ${n.short}`, material: mat, isFastener: true });
    } else {
      add({ key: l.id, desc: l.label, short: l.label, material: '', isFastener: false });
    }
    if (l.kind === 'boss') {
      const ins = bossInsert(l, size);
      if (ins) add({ key: 'insert', desc: `Heat-set insert ${size}, Ø${ins.od} × ${ins.len}`, short: `${size} heat-set insert`, material: 'Brass', isFastener: true });
      break;
    }
  }
  return items;
}

/** BOM rows: fasteners first, then clamped parts if enabled. */
export function buildBom(j: Joint, items: Map<string, Item>): BomRow[] {
  const all = [...items.values()];
  const rows = [...all.filter((i) => i.isFastener), ...(j.options.bomParts ? all.filter((i) => !i.isFastener) : [])];
  return rows.map((r, i) => ({ ...r, no: i + 1 }));
}
