// Isometric view. Every part is coaxial with the screw, so drawing opaque
// (white-filled) solids from the bottom up is a correct painter's algorithm.
// World: x/z horizontal, h up (mm). Screen: px, y down.

import { HEX_CORNER, extraData, headDims, nutRadius, sizeData, washerDims } from '../library';
import { bossHoleDepth, bossInsert, placeStack, type Joint } from '../model';
import type { Anchor, Section } from './section';
import { shankGeometry } from './section';
import type { Prim, Pt, Weight } from './svg';

const C30 = Math.cos(Math.PI / 6);
/** Screen semi-axes of a horizontal circle of unit radius. */
const ERX = Math.SQRT2 * C30, ERY = Math.SQRT2 / 2;
const TARGET_HEIGHT = 440;

export function renderIso(j: Joint): Section {
  const sd = sizeData(j.screw.size);
  const { d, P } = sd;
  const type = j.screw.type;
  const head = headDims(type, sd);
  const L = j.screw.length;
  const placed = placeStack(j);
  const exploded = j.options.exploded;

  // Widest round thing decides the size of the (square) clamped parts.
  let maxR = Math.max(head.dk / 2, sd.clearance);
  for (const { layer: l } of placed) {
    if (l.kind === 'washer') maxR = Math.max(maxR, washerDims(l.type, j.screw.size)[1] / 2);
    if (l.kind === 'nut') maxR = Math.max(maxR, nutRadius(l.type, j.screw.size));
    if (l.kind === 'boss') maxR = Math.max(maxR, l.diameter / 2);
  }
  const A = maxR * 1.5; // half-side of square parts
  // Exploded spacing; generous enough that a slab's raised back corner clears the part above.
  const gap = exploded ? Math.max(2.5 * d, 4, A * 0.8) : 0;

  // World heights. Assembled: y (down) becomes h = -y. Exploded: parts spread by `gap`
  // and the screw lifted clear so its tip sits one gap above the top part.
  const layers = placed.map((p, i) => ({ ...p, h0: -p.y1 - i * gap, h1: -p.y0 - i * gap }));
  const lift = exploded ? L + gap : 0;
  const headTop = lift + (type === 'csk' ? 0 : head.k);
  const tipH = lift - L;
  const bottom = Math.min(tipH, ...layers.map((l) => l.h0));
  const S = Math.min(40, Math.max(3, TARGET_HEIGHT / (headTop - bottom + A * 1.2)));

  const prims: Prim[] = [];
  const anchors: Anchor[] = [];
  const f = (v: number) => v.toFixed(2);
  const proj = (x: number, z: number, h: number): Pt => [(x - z) * C30 * S, ((x + z) / 2 - h) * S];
  const cy = (h: number) => -h * S;
  const ell = (r: number) => [r * ERX * S, r * ERY * S] as const;
  const path = (dd: string, w: Weight, bb: [number, number, number, number], fill?: 'white') =>
    prims.push({ t: 'path', d: dd, w, bb, fill });
  const poly = (pts: Pt[], w: Weight = 'thick', fill?: 'white') => prims.push({ t: 'poly', pts, w, fill });
  // Leaders: each part offers candidate points (best first); the first one not
  // covered by something painted later wins. Fully hidden parts get no leader.
  const occluders: Pt[][] = [];
  const pending: { key: string; cands: Pt[]; order: number }[] = [];
  const anchor = (key: string, cands: Pt[]) => pending.push({ key, cands, order: occluders.length });
  /** Points on the visible side of a round body, front-right first. */
  const roundCands = (r: number, h0: number, h1: number): Pt[] => {
    const [rx, ry] = ell(r), out: Pt[] = [];
    for (const fh of [0.5, 0.2, 0.8]) {
      for (const b of [50, 25, 70, 85]) {
        const a = (b * Math.PI) / 180;
        out.push([rx * Math.sin(a), cy(h0 + (h1 - h0) * fh) + ry * Math.cos(a)]);
      }
    }
    return out;
  };
  /** Points on the top face of a ring between radii r0 and r1. */
  const topCands = (r0: number, r1: number, h: number): Pt[] =>
    [45, 20, 70, 0, 90].map((b) => {
      const a = (b * Math.PI) / 180, [rx, ry] = ell((r0 + r1) / 2);
      return [rx * Math.sin(a), cy(h) + ry * Math.cos(a)];
    });
  /** Silhouette of a frustum as a polygon, for occlusion tests. */
  const frustumOutline = (r0: number, h0: number, r1: number, h1: number): Pt[] => {
    const [ax, ay] = ell(r0), [bx, by] = ell(r1), N = 16, out: Pt[] = [];
    for (let i = 0; i <= N; i++) out.push([-ax * Math.cos((Math.PI * i) / N), cy(h0) + ay * Math.sin((Math.PI * i) / N)]);
    for (let i = 0; i <= N; i++) out.push([bx * Math.cos((Math.PI * i) / N), cy(h1) - by * Math.sin((Math.PI * i) / N)]);
    return out;
  };

  // --- Shape builders ----------------------------------------------------------
  const ellipse = (r: number, h: number, w: Weight, fill?: 'white') => {
    const [rx, ry] = ell(r), c = cy(h);
    path(`M${f(-rx)},${f(c)} A${f(rx)},${f(ry)} 0 0 1 ${f(rx)},${f(c)} A${f(rx)},${f(ry)} 0 0 1 ${f(-rx)},${f(c)} Z`,
      w, [-rx, c - ry, rx, c + ry], fill);
  };
  /** Front half of a horizontal circle. */
  const frontArc = (r: number, h: number, w: Weight) => {
    const [rx, ry] = ell(r), c = cy(h);
    path(`M${f(-rx)},${f(c)} A${f(rx)},${f(ry)} 0 0 0 ${f(rx)},${f(c)}`, w, [-rx, c, rx, c + ry]);
  };
  /** Cone frustum / cylinder body (radius r0 at h0, r1 at h1), optionally with its top face. */
  const solid = (r0: number, h0: number, r1: number, h1: number, top = true) => {
    const [ax, ay] = ell(r0), [bx, by] = ell(r1), c0 = cy(h0), c1 = cy(h1);
    path(
      `M${f(-bx)},${f(c1)} L${f(-ax)},${f(c0)} A${f(ax)},${f(ay)} 0 0 0 ${f(ax)},${f(c0)} ` +
      `L${f(bx)},${f(c1)} A${f(bx)},${f(by)} 0 0 0 ${f(-bx)},${f(c1)} Z`,
      'thick', [-Math.max(ax, bx), c1 - by, Math.max(ax, bx), c0 + ay], 'white');
    occluders.push(frustumOutline(r0, h0, r1, h1));
    if (top) ellipse(r1, h1, 'thick', 'white');
  };
  const cylinder = (r: number, h0: number, h1: number, top = true) => solid(r, h0, r, h1, top);

  /** Hole in a top face, with the far wall's lower edge showing through. */
  const hole = (r: number, h: number, depth: number, thread = false) => {
    ellipse(r, h, 'thick', 'white');
    const [rx, ry] = ell(r), c = cy(h), dp = depth * S;
    if (dp < 2 * ry) {
      const x = rx * Math.sqrt(1 - (dp / 2 / ry) ** 2);
      path(`M${f(-x)},${f(c + dp / 2)} A${f(rx)},${f(ry)} 0 0 1 ${f(x)},${f(c + dp / 2)}`, 'thin', [-x, c - ry, x, c + dp / 2]);
    }
    if (thread) [0.86, 0.72].forEach((k) => ellipse(r * k, h, 'thin'));
  };

  const hexPoints = (s: number, h: number) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = ((15 + 60 * i) * Math.PI) / 180, rv = (s * HEX_CORNER) / 2;
      return proj(rv * Math.cos(a), rv * Math.sin(a), h);
    });
  /** Hex prism, across flats `s`, with one face square-on to the viewer. */
  const hexPrism = (s: number, h0: number, h1: number) => {
    const top = hexPoints(s, h1), bot = hexPoints(s, h0), outline = hull([...top, ...bot]);
    poly(outline, 'thick', 'white');
    occluders.push(outline);
    poly(top, 'thick');
    for (let i = 0; i < 6; i++) {
      const nrm = ((45 + 60 * i) * Math.PI) / 180; // outward normal of face i→i+1
      if (Math.cos(nrm) + Math.sin(nrm) <= 1e-6) continue;
      for (const k of [i, (i + 1) % 6]) {
        prims.push({ t: 'line', x1: top[k][0], y1: top[k][1], x2: bot[k][0], y2: bot[k][1], w: 'thick' });
      }
    }
    ellipse(s / 2, h1, 'thin'); // chamfer circle
  };

  /** Square slab (clamped part / enclosure wall) of half-side a. */
  const slab = (a: number, h0: number, h1: number) => {
    const corners: [number, number][] = [[a, -a], [a, a], [-a, a], [-a, -a]];
    const top = corners.map(([x, z]) => proj(x, z, h1)), bot = corners.map(([x, z]) => proj(x, z, h0));
    const outline = hull([...top, ...bot]);
    poly(outline, 'thick', 'white');
    occluders.push(outline);
    poly(top, 'thick');
    prims.push({ t: 'line', x1: top[1][0], y1: top[1][1], x2: bot[1][0], y2: bot[1][1], w: 'thick' });
  };

  const socket = (s: number, h: number) => poly(hexPoints(s, h), 'thick', 'white');

  // --- Screw -------------------------------------------------------------------
  const g = shankGeometry(j);
  const shankTopH = lift - g.yS;
  /** Draws the visible part of the shank between two heights (assembled view hides the rest). */
  const shank = (hLo: number, hHi: number) => {
    if (hHi - hLo < 1e-6) return;
    cylinder(d / 2, hLo, hHi, false);
    const threadTop = Math.min(hHi, lift - g.thrStart);
    const step = Math.max(P, 2.6 / S);
    for (let h = Math.max(hLo, tipH + g.ch) + step / 2; h < threadTop; h += step) frontArc(d / 2, h, 'thin');
    if (hLo <= tipH + 1e-6) frontArc(g.d1 / 2, tipH, 'thin');
  };

  const drawHead = () => {
    const r = head.dk / 2, k = head.k;
    const h0 = type === 'csk' ? lift - k : lift, h1 = h0 + k;
    switch (type) {
      case 'shcs':
        cylinder(r, h0, h1);
        ellipse(r * 0.88, h1, 'thin');
        socket(d * 0.8, h1);
        break;
      case 'hex':
        hexPrism(sd.hexS, h0, h1);
        break;
      case 'button': {
        const side = k * 0.3, [rx, ry] = ell(r), c = cy(h0 + side), c0 = cy(h0), dome = ry + (k - side) * S;
        path(`M${f(-rx)},${f(c0)} L${f(-rx)},${f(c)} A${f(rx)},${f(dome)} 0 0 1 ${f(rx)},${f(c)} ` +
          `L${f(rx)},${f(c0)} A${f(rx)},${f(ry)} 0 0 1 ${f(-rx)},${f(c0)} Z`, 'thick', [-rx, c - dome, rx, c0 + ry], 'white');
        occluders.push(frustumOutline(r, h0, r, h1));
        socket(d * 0.6, h1);
        break;
      }
      case 'pan': {
        cylinder(r, h0, h1);
        ellipse(r * 0.8, h1, 'thin');
        const a = r * 0.45;
        for (const [x, z] of [[a, 0], [0, a]] as const) {
          const p0 = proj(-x, -z, h1), p1 = proj(x, z, h1);
          prims.push({ t: 'line', x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1], w: 'thick' });
        }
        break;
      }
      case 'set':
        ellipse(d / 2, h1, 'thick', 'white');
        socket(d * 0.5, h1);
        break;
      case 'csk':
        // Assembled, the head sits flush in its countersink: only the top face shows.
        if (exploded) solid(d / 2, h0, r, h1);
        else ellipse(r, h1, 'thick', 'white');
        socket(d * 0.65, h1);
        break;
    }
    anchor('screw', type === 'set'
      ? [...roundCands(d / 2, tipH, h1), ...topCands(0, d / 2, h1)]
      : type === 'csk'
      ? topCands(0, r, h1) // the cone is hidden when assembled, and narrow when exploded
      : [...roundCands(r, h0, h1), ...topCands(0, r, h1)]);
  };

  // --- Layers --------------------------------------------------------------------
  const drawLayer = ({ layer: l, h0, h1 }: (typeof layers)[number], i: number) => {
    const t = h1 - h0;
    switch (l.kind) {
      case 'washer': {
        const [r1, r2] = washerDims(l.type, j.screw.size);
        cylinder(r2 / 2, h0, h1);
        hole(r1 / 2, h1, t);
        if (l.type === 'spring') {
          // The split, across the ring and down its outer face.
          const a = (20 * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
          const p = [proj((r1 / 2) * ca, (r1 / 2) * sa, h1), proj((r2 / 2) * ca, (r2 / 2) * sa, h1), proj((r2 / 2) * Math.cos(a + (0.3 * t) / r2), (r2 / 2) * Math.sin(a + (0.3 * t) / r2), h0)];
          for (let k = 0; k < 2; k++) prims.push({ t: 'line', x1: p[k][0], y1: p[k][1], x2: p[k + 1][0], y2: p[k + 1][1], w: 'thick' });
        }
        anchor(`washer:${l.type}`, [...topCands(r1 / 2, r2 / 2, h1), ...roundCands(r2 / 2, h0, h1)]);
        break;
      }
      case 'nut': {
        const size = j.screw.size, s = sd.hexS;
        let hexLo = h0, hexHi = h1;
        if (l.type === 'nyloc') {
          hexLo = h1 - Math.min(sd.nutM, t * 0.75);
          cylinder(s * 0.46, h0, hexLo, false);
        } else if (l.type === 'dome') {
          // Closed dome on the tip side, below the hex.
          hexLo = h0 + t * 0.5;
          const [rx, ry] = ell(s * 0.45), c = cy(hexLo), depth = (hexLo - h0) * S;
          path(`M${f(-rx)},${f(c)} A${f(rx)},${f(ry + depth)} 0 0 0 ${f(rx)},${f(c)} Z`, 'thick', [-rx, c, rx, c + ry + depth], 'white');
          occluders.push(frustumOutline(s * 0.45, h0, s * 0.45, hexLo));
        } else if (l.type === 'flange') {
          hexHi = h1 - extraData(size).flange[2] * 1.6;
        }
        hexPrism(s, hexLo, hexHi);
        if (l.type === 'flange') {
          const fr = extraData(size).flange[0] / 2;
          solid(fr, hexHi, fr, h1);
        }
        hole(d / 2, h1, t, true);
        anchor(`nut:${l.type}`, [
          ...[0.5, 0.2, 0.8].flatMap((fh) => [0.15, -0.3, 0.6].map((z) => proj(s / 2, (z * s) / 2, hexLo + (hexHi - hexLo) * fh))),
          ...(l.type === 'flange' ? roundCands(nutRadius('flange', size), hexHi, h1) : roundCands(s * 0.46, h0, hexLo)),
        ]);
        break;
      }
      case 'part': {
        slab(A, h0, h1);
        const rc = l.hole === 'tapped' ? d / 2 : sd.clearance / 2;
        if (type === 'csk' && i === 0) {
          // Countersink: rim at the head diameter, funnelling down to the hole.
          const dep = Math.min(head.dk / 2 - rc, t);
          ellipse(head.dk / 2 + 0.2, h1, 'thick', 'white');
          hole(rc, h1 - dep, t - dep);
        } else {
          hole(rc, h1, t, l.hole === 'tapped');
        }
        anchor(l.id, [-0.25, -0.6, 0.3, 0.7].flatMap((z) => [proj(A, z * A, (h0 + h1) / 2), proj(z * A, A, (h0 + h1) / 2)]));
        break;
      }
      case 'boss': {
        const wall = Math.max(0.5, l.wall), R = Math.max(d / 2 + 0.3, l.diameter / 2);
        slab(A, h0, h0 + wall);
        cylinder(R, h0 + wall, h1);
        const ins = bossInsert(l, j.screw.size);
        if (ins) {
          const ri = Math.min(ins.od / 2, R - 0.3);
          ellipse(ri, h1, 'thick', 'white');
          ellipse(ri * 0.86, h1, 'thin');
          anchor('insert', topCands(d / 2, ri, h1));
        }
        hole(d / 2, h1, bossHoleDepth(l, sd), true);
        anchor(l.id, [...roundCands(R, h0 + wall, h1), proj(A, -0.4 * A, h0 + wall / 2), proj(-0.4 * A, A, h0 + wall / 2)]);
        break;
      }
    }
  };

  // --- Paint bottom-up -----------------------------------------------------------
  if (exploded) {
    const [x0, y0] = proj(0, 0, headTop + 3 * gap / 4), [x1, y1] = proj(0, 0, bottom - gap / 2);
    prims.push({ t: 'line', x1: x0, y1: y0, x2: x1, y2: y1, w: 'thin', dash: 'chain' });
    layers.map((l, i) => [l, i] as const).reverse().forEach(([l, i]) => drawLayer(l, i));
    shank(tipH, shankTopH);
  } else {
    const stackBottom = layers.at(-1)?.h0 ?? 0;
    shank(tipH, Math.min(stackBottom, shankTopH));
    layers.map((l, i) => [l, i] as const).reverse().forEach(([l, i]) => drawLayer(l, i));
  }
  drawHead();

  for (const p of pending) {
    const later = occluders.slice(p.order);
    const pt = p.cands.find((c) => !later.some((o) => inside(c, o)));
    if (pt) anchors.push({ key: p.key, x: pt[0], y: pt[1] });
  }
  return { prims, anchors };
}

/** Convex hull (monotone chain), counter-clockwise. */
function hull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (pts: Pt[]) => {
    const out: Pt[] = [];
    for (const q of pts) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    out.pop();
    return out;
  };
  return [...build(p), ...build([...p].reverse())];
}

/** Even-odd point-in-polygon test. */
function inside([x, y]: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
    const [xi, yi] = poly[i], [xk, yk] = poly[k];
    if (yi > y !== yk > y && x < ((xk - xi) * (y - yi)) / (yk - yi) + xi) hit = !hit;
  }
  return hit;
}
