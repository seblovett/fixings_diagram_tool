// Drawing primitives (in px) and their serialisation to a standalone SVG.

export type Pt = [number, number];
export type Weight = 'thick' | 'thin' | 'hatch';
/** Solid fills: black for thin cut sections, white for opaque iso solids. */
export type Fill = 'black' | 'white';
const FILL: Record<Fill, string> = { black: '#000', white: '#fff' };

export type Prim =
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; w: Weight; dash?: boolean | 'chain' }
  | { t: 'poly'; pts: Pt[]; w: Weight; fill?: Fill }
  | { t: 'path'; d: string; w: Weight; bb: [number, number, number, number]; fill?: Fill }
  | { t: 'circle'; cx: number; cy: number; r: number; w: Weight; fill?: boolean }
  | { t: 'text'; x: number; y: number; s: string; size: number; anchor: 'start' | 'middle' | 'end'; bold?: boolean };

const STROKE: Record<Weight, number> = { thick: 1.8, thin: 0.8, hatch: 0.6 };
const DASH = '5 3';
const CHAIN = '12 3 2 3';
export const FONT = 'Helvetica, Arial, sans-serif';

/** Rough text width; good enough for layout without a DOM. */
export const textWidth = (s: string, size: number, bold = false) => s.length * size * (bold ? 0.6 : 0.55);

export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

export function bounds(prims: Prim[]): Bounds {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const add = (x: number, y: number) => {
    b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x);
    b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y);
  };
  for (const p of prims) {
    switch (p.t) {
      case 'line': add(p.x1, p.y1); add(p.x2, p.y2); break;
      case 'poly': p.pts.forEach(([x, y]) => add(x, y)); break;
      case 'path': add(p.bb[0], p.bb[1]); add(p.bb[2], p.bb[3]); break;
      case 'circle': add(p.cx - p.r, p.cy - p.r); add(p.cx + p.r, p.cy + p.r); break;
      case 'text': {
        const w = textWidth(p.s, p.size, p.bold);
        const x0 = p.anchor === 'start' ? p.x : p.anchor === 'middle' ? p.x - w / 2 : p.x - w;
        add(x0, p.y - p.size); add(x0 + w, p.y + p.size * 0.25);
        break;
      }
    }
  }
  return b;
}

const n = (v: number) => String(Math.round(v * 100) / 100);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sw = (w: Weight) => `stroke-width="${STROKE[w]}"`;

function primToSvg(p: Prim): string {
  switch (p.t) {
    case 'line':
      return `<line x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}" ${sw(p.w)}${p.dash ? ` stroke-dasharray="${p.dash === 'chain' ? CHAIN : DASH}"` : ''}/>`;
    case 'poly':
      return `<polygon points="${p.pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' ')}" ${sw(p.w)}${p.fill ? ` fill="${FILL[p.fill]}"` : ''}/>`;
    case 'path':
      return `<path d="${p.d}" ${sw(p.w)}${p.fill ? ` fill="${FILL[p.fill]}"` : ''}/>`;
    case 'circle':
      return `<circle cx="${n(p.cx)}" cy="${n(p.cy)}" r="${n(p.r)}" ${sw(p.w)}${p.fill ? ' fill="#000"' : ''}/>`;
    case 'text':
      return `<text x="${n(p.x)}" y="${n(p.y)}" font-size="${p.size}" text-anchor="${p.anchor}"${p.bold ? ' font-weight="bold"' : ''} fill="#000" stroke="none">${esc(p.s)}</text>`;
  }
}

/** Standalone SVG with a transparent background, sized to its contents. */
export function toSvg(prims: Prim[], pad = 12): { svg: string; width: number; height: number } {
  const b = bounds(prims);
  const x = Math.floor(b.minX - pad), y = Math.floor(b.minY - pad);
  const width = Math.ceil(b.maxX + pad) - x, height = Math.ceil(b.maxY + pad) - y;
  const body = prims.map(primToSvg).join('\n  ');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}" ` +
    `fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round" font-family="${FONT}">\n  ${body}\n</svg>\n`;
  return { svg, width, height };
}

/** Hatch lines clipped to a simple polygon (even-odd), at `angle` degrees with `spacing` px pitch. */
export function hatch(poly: Pt[], angle: number, spacing: number): Prim[] {
  const a = (angle * Math.PI) / 180;
  const u: Pt = [Math.cos(a), -Math.sin(a)]; // along the hatch line (y down)
  const nrm: Pt = [-u[1], u[0]];
  const dot = (p: Pt, v: Pt) => p[0] * v[0] + p[1] * v[1];
  const proj = poly.map((p) => dot(p, nrm));
  const lo = Math.min(...proj), hi = Math.max(...proj);
  const out: Prim[] = [];
  for (let k = Math.ceil(lo / spacing - 0.5); (k + 0.5) * spacing < hi; k++) {
    const off = (k + 0.5) * spacing; // offset by half a pitch so lines never graze vertices
    const ts: number[] = [];
    for (let i = 0; i < poly.length; i++) {
      const A = poly[i], B = poly[(i + 1) % poly.length];
      const da = dot(A, nrm) - off, db = dot(B, nrm) - off;
      if (da < 0 !== db < 0) {
        const f = da / (da - db);
        ts.push(dot([A[0] + f * (B[0] - A[0]), A[1] + f * (B[1] - A[1])], u));
      }
    }
    ts.sort((p, q) => p - q);
    for (let i = 0; i + 1 < ts.length; i += 2) {
      const p0: Pt = [nrm[0] * off + u[0] * ts[i], nrm[1] * off + u[1] * ts[i]];
      const p1: Pt = [nrm[0] * off + u[0] * ts[i + 1], nrm[1] * off + u[1] * ts[i + 1]];
      out.push({ t: 'line', x1: p0[0], y1: p0[1], x2: p1[0], y2: p1[1], w: 'hatch' });
    }
  }
  return out;
}
