// Cross-section view: clamped parts are cut and hatched; the screw, washers and
// nuts are drawn unsectioned (standard convention), with the screw shown as a
// hidden line where washers and nuts cover it.

import {
  HEX_CORNER, MATERIALS, extraData, headDims, nutRadius, sizeData, washerDims, type MaterialType,
} from '../library';
import { DRILL_CONE, bossHoleDepth, bossInsert, placeStack, type Joint } from '../model';
import { hatch, type Prim, type Pt, type Weight } from './svg';

export interface Anchor { key: string; x: number; y: number } // px

export interface Section { prims: Prim[]; anchors: Anchor[] }

/** Drawing height the scale is fitted to, px. */
const TARGET_HEIGHT = 380;
/** Cut sections thinner than this (px) are filled solid instead of hatched. */
const SOLID_BELOW = 4.5;

export function renderSection(j: Joint): Section {
  const sd = sizeData(j.screw.size);
  const { d } = sd;
  const type = j.screw.type;
  const head = headDims(type, sd);
  const L = j.screw.length;
  const placed = placeStack(j);
  const stackEnd = placed.at(-1)?.y1 ?? 0;

  const topY = type === 'csk' ? 0 : -head.k;
  const S = Math.min(40, Math.max(4, TARGET_HEIGHT / (Math.max(L, stackEnd) - topY)));

  // Width of clamped parts: comfortably wider than anything sitting on them.
  let W = Math.max(5 * d, head.dk * 1.8);
  for (const p of placed) {
    const l = p.layer;
    if (l.kind === 'washer') W = Math.max(W, washerDims(l.type, j.screw.size)[1] * 1.5);
    if (l.kind === 'nut') W = Math.max(W, nutRadius(l.type, j.screw.size) * 3);
    if (l.kind === 'boss') W = Math.max(W, l.diameter * 2);
  }

  const prims: Prim[] = [];
  const anchors: Anchor[] = [];
  const px = ([x, y]: Pt): Pt => [x * S, y * S];
  const line = (x1: number, y1: number, x2: number, y2: number, w: Weight, dash = false) =>
    prims.push({ t: 'line', x1: x1 * S, y1: y1 * S, x2: x2 * S, y2: y2 * S, w, dash });
  const poly = (pts: Pt[], w: Weight = 'thick') => prims.push({ t: 'poly', pts: pts.map(px), w });
  const rect = (x0: number, y0: number, x1: number, y1: number) => poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  const anchor = (key: string, x: number, y: number) => anchors.push({ key, x: x * S, y: y * S });

  // --- Clamped parts (sectioned) ---------------------------------------------
  let cutIndex = 0;
  const cut = (pts: Pt[], material: MaterialType, thickness: number) => {
    const p = pts.map(px);
    if (thickness * S < SOLID_BELOW) {
      prims.push({ t: 'poly', pts: p, w: 'thin', fill: 'black' });
    } else {
      prims.push(...hatch(p, cutIndex % 2 ? 135 : 45, MATERIALS[material].spacing));
      prims.push({ t: 'poly', pts: p, w: 'thick' });
    }
  };

  // A 90° countersink (radius cskR at y=0, shrinking 1:1 with depth) runs down
  // through however many leading parts it needs.
  const cskR = head.dk / 2 + 0.2;
  let cskOpen = type === 'csk';

  placed.forEach((pl) => {
    const l = pl.layer;
    const { y0, y1 } = pl;
    const t = y1 - y0;
    if (l.kind !== 'part') cskOpen = false;
    if (l.kind === 'part') {
      const rc = l.hole === 'tapped' ? d / 2 : sd.clearance / 2;
      const coneEnd = cskR - rc;
      const left: Pt[] = [[-W / 2, y0]];
      if (cskOpen && y0 < coneEnd) {
        const yEnd = Math.min(coneEnd, y1);
        left.push([-(cskR - y0), y0], [-(cskR - yEnd), yEnd]);
        if (yEnd < y1 - 1e-9) left.push([-rc, y1]);
      } else {
        left.push([-rc, y0], [-rc, y1]);
      }
      left.push([-W / 2, y1]);
      const right = left.map(([x, y]): Pt => [-x, y]).reverse();
      cut(left, l.material, t);
      cut(right, l.material, t);
      cutIndex++;
      anchor(l.id, rc + (W / 2 - rc) * 0.62, (y0 + y1) / 2);
    } else if (l.kind === 'boss') {
      const rd = d / 2, R = Math.max(rd + 0.3, l.diameter / 2);
      const H = Math.max(0.5, l.height), T = Math.max(0.5, l.wall);
      const ins = bossInsert(l, j.screw.size);
      const cone = rd * DRILL_CONE;
      const D = Math.max(bossHoleDepth(l, sd), ins?.len ?? 0);
      const ri = ins ? Math.min(ins.od / 2, R - 0.3) : rd; // bore radius at the top
      const yi = y0 + (ins?.len ?? 0); // bottom of the insert bore
      const leftWall: Pt[] = ins ? [[-ri, y0], [-ri, yi], [-rd, yi]] : [[-rd, y0]];
      const rightWall = leftWall.map(([x, y]): Pt => [-x, y]).reverse();
      const profile: Pt[] = [
        [-R, y0], ...leftWall, [-rd, y0 + D], [0, y0 + D + cone], [rd, y0 + D], ...rightWall, [R, y0],
        [R, y0 + H], [W / 2, y0 + H], [W / 2, y0 + H + T], [-W / 2, y0 + H + T], [-W / 2, y0 + H], [-R, y0 + H],
      ];
      cut(profile, 'plastic', Math.min(T, R - ri));
      cutIndex++;
      anchor(l.id, (R + ri) / 2, y0 + Math.max(ins?.len ?? 0, Math.min(H, D) * 0.5));
      if (ins) {
        // Brass insert, sectioned with a fine hatch in the opposite direction.
        for (const s of [-1, 1]) {
          const ring: Pt[] = [[s * rd, y0], [s * ri, y0], [s * ri, yi], [s * rd, yi]];
          cut(ring, 'pcb', ri - rd);
        }
        cutIndex++;
        anchor('insert', -(rd + ri) / 2, y0 + (yi - y0) * 0.5);
      }
    }
  });

  // --- Washers and nuts (unsectioned) ----------------------------------------
  const covered: [number, number][] = [];
  for (const { layer: l, y0, y1 } of placed) {
    if (l.kind === 'washer') {
      const r = washerDims(l.type, j.screw.size)[1] / 2;
      rect(-r, y0, r, y1);
      if (l.type === 'spring') line(r * 0.45, y0, r * 0.62, y1, 'thick'); // the split
      covered.push([y0, y1]);
      anchor(`washer:${l.type}`, r * 0.8, (y0 + y1) / 2);
    } else if (l.kind === 'nut') {
      const e = sd.hexS * HEX_CORNER;
      const f = (v: number) => (v * S).toFixed(2);
      /** Rounded cap on the tip side of the nut (nyloc collar, dome). */
      const cap = (cw: number, top: number, r: number, dome = false) => {
        prims.push({
          t: 'path', w: 'thick',
          d: dome
            ? `M${f(-cw)},${f(top)} L${f(-cw)},${f(y1 - r)} A${f(cw)},${f(r)} 0 0 0 ${f(cw)},${f(y1 - r)} L${f(cw)},${f(top)}`
            : `M${f(-cw)},${f(top)} L${f(-cw)},${f(y1 - r)} Q${f(-cw)},${f(y1)} ${f(-cw + r)},${f(y1)} ` +
              `L${f(cw - r)},${f(y1)} Q${f(cw)},${f(y1)} ${f(cw)},${f(y1 - r)} L${f(cw)},${f(top)}`,
          bb: [-cw * S, top * S, cw * S, y1 * S],
        });
      };
      let hexTop = y0, hexBottom = y1;
      if (l.type === 'nyloc') {
        // Collar carrying the nylon insert, on the side away from the head.
        hexBottom = y0 + Math.min(sd.nutM, (y1 - y0) * 0.75);
        const cw = (sd.hexS * 0.92) / 2;
        cap(cw, hexBottom, Math.min((y1 - hexBottom) * 0.6, cw * 0.3));
      } else if (l.type === 'dome') {
        hexBottom = y0 + (y1 - y0) * 0.5;
        const cw = (sd.hexS * 0.9) / 2;
        cap(cw, hexBottom, Math.min(cw, (y1 - hexBottom) * 0.8), true);
      } else if (l.type === 'flange') {
        // Serrated flange bears on the joint, i.e. faces the head.
        const [dc, , c] = extraData(j.screw.size).flange;
        hexTop = y0 + c * 1.6;
        poly([[-dc / 2, y0], [dc / 2, y0], [dc / 2, y0 + c], [e / 2, hexTop], [-e / 2, hexTop], [-dc / 2, y0 + c]]);
      }
      hexElevation(e, hexTop, hexBottom, rect, line);
      covered.push([y0, y1]);
      anchor(`nut:${l.type}`, (e / 2) * 0.72, (hexTop + hexBottom) / 2);
    }
  }

  // --- Screw ------------------------------------------------------------------
  const isCovered = (y: number) => covered.some(([a, b]) => y > a + 1e-6 && y < b - 1e-6);
  const hidden = (x1: number, y1: number, x2: number, y2: number) => {
    if (j.options.hidden) line(x1, y1, x2, y2, 'thin', true);
  };
  /** Draws a screw edge, switching to a hidden line where washers/nuts cover it. */
  const screwLine = (x1: number, y1: number, x2: number, y2: number, w: Weight) => {
    if (Math.abs(x1 - x2) > 1e-9) {
      if (isCovered((y1 + y2) / 2)) hidden(x1, y1, x2, y2);
      else line(x1, y1, x2, y2, w);
      return;
    }
    const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
    const cuts = [lo, ...covered.flat().filter((y) => y > lo && y < hi), hi].sort((a, b) => a - b);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i], b = cuts[i + 1];
      if (b - a < 1e-9) continue;
      if (isCovered((a + b) / 2)) hidden(x1, a, x1, b);
      else line(x1, a, x1, b, w);
    }
  };

  drawHead(j, head, d, S, prims, line, poly, hidden);
  anchor('screw', head.dk * 0.3, type === 'csk' ? head.k * 0.3 : type === 'set' ? L * 0.2 : -head.k / 2);

  const { yS, d1, ch, partial, thrStart } = shankGeometry(j);
  for (const s of [-1, 1]) {
    screwLine((s * d) / 2, yS, (s * d) / 2, L - ch, 'thick');
    screwLine((s * d) / 2, L - ch, (s * d1) / 2, L, 'thick');
    screwLine((s * d1) / 2, thrStart, (s * d1) / 2, L - ch, 'thin');
  }
  screwLine(-d1 / 2, L, d1 / 2, L, 'thick');
  if (partial) screwLine(-d / 2, thrStart, d / 2, thrStart, 'thick');

  return { prims, anchors };
}

/** Shank and thread extents along y (mm, y=0 under a normal head, y=L at the tip). */
export function shankGeometry(j: Joint) {
  const sd = sizeData(j.screw.size);
  const { d, P } = sd;
  const L = j.screw.length;
  const yS = j.screw.type === 'csk' ? headDims('csk', sd).k : 0; // where the shank starts
  const d1 = d - 1.2269 * P; // minor diameter
  const ch = Math.min((d - d1) / 2, (L - yS) / 2); // tip chamfer
  const shank = L - yS;
  const partial = shank > 2 * d + 12;
  const thrStart = partial ? L - (2 * d + 6) : yS + Math.min(2 * P, shank * 0.2);
  return { yS, d1, ch, partial, thrStart };
}

type LineFn = (x1: number, y1: number, x2: number, y2: number, w: Weight, dash?: boolean) => void;

/** Hex viewed across corners: three faces. */
function hexElevation(e: number, y0: number, y1: number, rect: (a: number, b: number, c: number, d: number) => void, line: LineFn) {
  rect(-e / 2, y0, e / 2, y1);
  line(-e / 4, y0, -e / 4, y1, 'thick');
  line(e / 4, y0, e / 4, y1, 'thick');
}

function drawHead(
  j: Joint, head: { dk: number; k: number }, d: number, S: number,
  prims: Prim[], line: LineFn, poly: (pts: Pt[], w?: Weight) => void,
  hidden: (x1: number, y1: number, x2: number, y2: number) => void,
) {
  const { dk, k } = head;
  const r = dk / 2;
  const f = (v: number) => (v * S).toFixed(2);
  const socket = (s: number, top: number, depth: number) => {
    hidden(-s / 2, top, -s / 2, top + depth);
    hidden(s / 2, top, s / 2, top + depth);
    hidden(-s / 2, top + depth, 0, top + depth + s * 0.3);
    hidden(s / 2, top + depth, 0, top + depth + s * 0.3);
  };
  switch (j.screw.type) {
    case 'shcs': {
      const c = dk * 0.08;
      poly([[-r, 0], [-r, -k + c], [-r + c, -k], [r - c, -k], [r, -k + c], [r, 0]]);
      socket(d * 0.8, -k, k * 0.5);
      break;
    }
    case 'hex': {
      const c = k * 0.15;
      poly([[-r, 0], [-r, -k + c], [-r + c, -k], [r - c, -k], [r, -k + c], [r, 0]]);
      line(-r / 2, -k, -r / 2, 0, 'thick');
      line(r / 2, -k, r / 2, 0, 'thick');
      break;
    }
    case 'button': {
      const side = k * 0.25;
      prims.push({
        t: 'path', w: 'thick',
        d: `M${f(-r)},0 L${f(-r)},${f(-side)} A${f(r)},${f(k - side)} 0 0 1 ${f(r)},${f(-side)} L${f(r)},0 Z`,
        bb: [-r * S, -k * S, r * S, 0],
      });
      socket(d * 0.6, -k, k * 0.55);
      break;
    }
    case 'pan': {
      const rr = Math.min(k * 0.6, r * 0.4);
      prims.push({
        t: 'path', w: 'thick',
        d: `M${f(-r)},0 L${f(-r)},${f(-k + rr)} Q${f(-r)},${f(-k)} ${f(-r + rr)},${f(-k)} ` +
          `L${f(r - rr)},${f(-k)} Q${f(r)},${f(-k)} ${f(r)},${f(-k + rr)} L${f(r)},0 Z`,
        bb: [-r * S, -k * S, r * S, 0],
      });
      // Pozi recess
      hidden(-dk * 0.2, -k, 0, -k + k * 0.65);
      hidden(dk * 0.2, -k, 0, -k + k * 0.65);
      break;
    }
    case 'csk': {
      poly([[-r, 0], [r, 0], [d / 2, k], [-d / 2, k]]);
      socket(d * 0.65, 0, k * 0.6);
      break;
    }
    case 'set': {
      line(-d / 2, 0, d / 2, 0, 'thick');
      socket(d * 0.5, 0, d * 0.45);
      break;
    }
  }
}
