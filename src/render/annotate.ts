// Callouts (text labels or numbered balloons with leader lines), title, BOM table and notes.

import type { BomRow, Item } from '../bom';
import type { Joint } from '../model';
import type { Anchor } from './section';
import { bounds, textWidth, type Prim } from './svg';

const LABEL_SIZE = 12;
const BALLOON_R = 9;
const SMALL = 11;

export function annotate(
  j: Joint, geometry: Prim[], anchors: Anchor[], items: Map<string, Item>, bom: BomRow[],
): Prim[] {
  const out: Prim[] = [];
  const g = bounds(geometry);
  if (j.options.labels !== 'none') out.push(...callouts(j, g, anchors, items, bom));

  const all = bounds([...geometry, ...out]);
  if (j.options.title && j.name.trim()) {
    out.push({ t: 'text', x: all.minX, y: all.minY - 18, s: j.name.trim(), size: 16, anchor: 'start', bold: true });
  }

  let y = all.maxY + 28;
  if (j.options.bom && bom.length) {
    const table = bomTable(bom, all.minX, y);
    out.push(...table);
    y = bounds(table).maxY + 22;
  }
  const notes = j.notes.split('\n').map((s) => s.trim()).filter(Boolean);
  if (notes.length) {
    out.push({ t: 'text', x: all.minX, y, s: 'Notes', size: SMALL, anchor: 'start', bold: true });
    notes.forEach((s, i) => out.push({ t: 'text', x: all.minX, y: y + 17 * (i + 1), s: `${i + 1}. ${s}`, size: SMALL, anchor: 'start' }));
  }
  return out;
}

function callouts(
  j: Joint, g: ReturnType<typeof bounds>, anchors: Anchor[], items: Map<string, Item>, bom: BomRow[],
): Prim[] {
  const out: Prim[] = [];
  const numbers = new Map(bom.map((r) => [r.key, r.no]));
  const balloons = j.options.labels === 'balloons';
  const gap = balloons ? BALLOON_R * 2 + 6 : LABEL_SIZE + 8;
  const list = anchors.filter((a) => items.has(a.key)).sort((p, q) => p.y - q.y);

  // Both sides: alternate down the drawing so each side gets every other callout. The
  // drawings are symmetric about x=0, so a left-side callout points at the mirrored spot.
  const both = j.options.calloutSide === 'both' && list.length > 3;
  for (const side of both ? [1, -1] : [1]) {
    const mine = list.filter((_, i) => !both || (i % 2 === 0) === (side === 1));
    const ys = spread(mine.map((a) => a.y), gap);
    const shelfX = side === 1 ? g.maxX + 24 : g.minX - 24;
    const textX = shelfX + side * 10;
    mine.forEach((a, i) => {
      const item = items.get(a.key)!;
      const ax = side * Math.abs(a.x), ty = ys[i];
      out.push({ t: 'circle', cx: ax, cy: a.y, r: 1.8, w: 'thin', fill: true });
      out.push({ t: 'line', x1: ax, y1: a.y, x2: shelfX, y2: ty, w: 'thin' });
      const no = numbers.get(a.key);
      if (balloons && no !== undefined) {
        out.push({ t: 'line', x1: shelfX, y1: ty, x2: textX, y2: ty, w: 'thin' });
        out.push({ t: 'circle', cx: textX + side * BALLOON_R, cy: ty, r: BALLOON_R, w: 'thin' });
        out.push({ t: 'text', x: textX + side * BALLOON_R, y: ty + 4, s: String(no), size: SMALL, anchor: 'middle' });
      } else {
        out.push({ t: 'line', x1: shelfX, y1: ty, x2: textX - side * 3, y2: ty, w: 'thin' });
        out.push({ t: 'text', x: textX, y: ty + 4, s: item.short, size: LABEL_SIZE, anchor: side === 1 ? 'start' : 'end' });
      }
    });
  }
  return out;
}

/**
 * Spaces sorted label positions at least `gap` apart while keeping each group of
 * crowded labels centred on the points they label.
 */
export function spread(desired: number[], gap: number): number[] {
  type Cluster = { first: number; n: number; top: number };
  const clusters: Cluster[] = desired.map((y, i) => ({ first: i, n: 1, top: y }));
  for (let k = 0; k + 1 < clusters.length;) {
    const a = clusters[k], b = clusters[k + 1];
    if (a.top + a.n * gap <= b.top + 1e-6) { k++; continue; }
    const n = a.n + b.n;
    const mean = desired.slice(a.first, a.first + n).reduce((s, y) => s + y, 0) / n;
    clusters.splice(k, 2, { first: a.first, n, top: mean - ((n - 1) * gap) / 2 });
    k = Math.max(0, k - 1); // the grown cluster may now hit the one above
  }
  return clusters.flatMap((c) => Array.from({ length: c.n }, (_, m) => c.top + m * gap));
}

function bomTable(rows: BomRow[], x0: number, y0: number): Prim[] {
  const rowH = 20, padX = 6;
  const hasPartNo = rows.some((r) => r.partNo);
  const hasMaterial = rows.some((r) => r.material);
  const cols: { title: string; get: (r: BomRow) => string; centre?: boolean }[] = [
    { title: 'Item', get: (r) => String(r.no), centre: true },
    { title: 'Qty', get: (r) => String(r.qty), centre: true },
    ...(hasPartNo ? [{ title: 'Part no.', get: (r: BomRow) => r.partNo }] : []),
    { title: 'Description', get: (r) => r.desc },
    ...(hasMaterial ? [{ title: 'Material', get: (r: BomRow) => r.material }] : []),
  ];
  const widths = cols.map((c) =>
    Math.max(textWidth(c.title, SMALL, true), ...rows.map((r) => textWidth(c.get(r), SMALL))) + padX * 2);
  const totalW = widths.reduce((a, b) => a + b, 0);
  const totalH = rowH * (rows.length + 1);
  const out: Prim[] = [];

  out.push({ t: 'poly', w: 'thick', pts: [[x0, y0], [x0 + totalW, y0], [x0 + totalW, y0 + totalH], [x0, y0 + totalH]] });
  out.push({ t: 'line', x1: x0, y1: y0 + rowH, x2: x0 + totalW, y2: y0 + rowH, w: 'thick' });
  for (let r = 2; r <= rows.length; r++) {
    out.push({ t: 'line', x1: x0, y1: y0 + rowH * r, x2: x0 + totalW, y2: y0 + rowH * r, w: 'thin' });
  }
  let x = x0;
  cols.forEach((c, i) => {
    const w = widths[i];
    if (i > 0) out.push({ t: 'line', x1: x, y1: y0, x2: x, y2: y0 + totalH, w: 'thin' });
    const tx = c.centre ? x + w / 2 : x + padX;
    const anchor = c.centre ? 'middle' : 'start';
    out.push({ t: 'text', x: tx, y: y0 + rowH - 6, s: c.title, size: SMALL, anchor, bold: true });
    rows.forEach((r, k) => out.push({ t: 'text', x: tx, y: y0 + rowH * (k + 2) - 6, s: c.get(r), size: SMALL, anchor }));
    x += w;
  });
  return out;
}
