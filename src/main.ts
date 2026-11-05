import './style.css';
import { analyse } from './analysis';
import {
  MATERIALS, NUT_TYPES, SCREW_TYPES, SIZES, STD_LENGTHS, WASHER_TYPES,
  type MaterialType, type NutType, type ScrewType, type Size, type WasherType,
} from './library';
import {
  bossDefaults, defaultJoint, defaultPartLabel, makeLayer, parseJoint,
  type Joint, type Layer, type LayerKind,
} from './model';
import { collectItems } from './bom';
import { renderJoint } from './render';

const STORAGE_KEY = 'fixings.joint';

let joint: Joint = loadSaved() ?? defaultJoint();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const panel = $('panel'), preview = $('preview'), warningsEl = $('warnings');
const nameInput = $<HTMLInputElement>('name'), fileInput = $<HTMLInputElement>('file');

// ---------------------------------------------------------------------------
// Rendering

let lengthSelect: HTMLSelectElement | null = null;
let lastSvg = { svg: '', width: 0, height: 0 };

/** Redraws the preview (cheap); call after any value change. */
function update() {
  const a = analyse(joint);
  if (joint.screw.auto && a.suggestedLength !== null && a.suggestedLength !== joint.screw.length) {
    joint.screw.length = a.suggestedLength;
    if (lengthSelect) lengthSelect.value = String(a.suggestedLength);
  }
  const warnings = analyse(joint).warnings;
  lastSvg = renderJoint(joint);
  preview.innerHTML = lastSvg.svg;
  warningsEl.replaceChildren(...warnings.map((w) => h('li', {}, w)));
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(joint)); } catch { /* storage unavailable */ }
}

/** Rebuilds the editing panel too; call after structural changes. */
function rebuild() {
  nameInput.value = joint.name;
  panel.replaceChildren(...buildPanel());
  update();
}

// ---------------------------------------------------------------------------
// Tiny DOM helpers

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, props: Partial<HTMLElementTagNameMap[K]> & Record<string, unknown> = {}, ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  Object.assign(el, props);
  el.append(...children);
  return el;
}

function select<T extends string>(value: T, options: [T, string][], onChange: (v: T) => void) {
  const el = h('select', {}, ...options.map(([v, label]) => h('option', { value: v, selected: v === value }, label)));
  el.addEventListener('change', () => { onChange(el.value as T); rebuild(); });
  return el;
}

function num(value: number, onInput: (v: number) => void, opts: { min?: number; step?: number } = {}) {
  const el = h('input', { type: 'number', value: String(value), min: String(opts.min ?? 0), step: String(opts.step ?? 0.1) });
  el.addEventListener('input', () => {
    const v = parseFloat(el.value);
    if (Number.isFinite(v) && v >= (opts.min ?? 0)) { onInput(v); update(); }
  });
  el.addEventListener('change', rebuild);
  return el;
}

function text(value: string, onInput: (v: string) => void) {
  const el = h('input', { type: 'text', value });
  el.addEventListener('input', () => { onInput(el.value); update(); });
  return el;
}

function check(label: string, value: boolean, onChange: (v: boolean) => void) {
  const box = h('input', { type: 'checkbox', checked: value });
  box.addEventListener('change', () => { onChange(box.checked); rebuild(); });
  return h('label', { className: 'check' }, box, label);
}

const field = (label: string, ...controls: Node[]) =>
  h('label', { className: 'field' }, h('span', {}, label), controls.length > 1 ? h('div', { className: 'inline' }, ...controls) : controls[0]);

const entries = <T extends string>(o: Record<T, { name: string }>) =>
  (Object.keys(o) as T[]).map((k): [T, string] => [k, o[k].name]);

// ---------------------------------------------------------------------------
// Panel

function buildPanel(): Node[] {
  const s = joint.screw;
  const lengths = STD_LENGTHS.includes(s.length) ? STD_LENGTHS : [...STD_LENGTHS, s.length].sort((a, b) => a - b);
  lengthSelect = select(String(s.length), lengths.map((l): [string, string] => [String(l), `${l} mm`]), (v) => { s.length = Number(v); });
  lengthSelect.disabled = s.auto;
  const auto = h('input', { type: 'checkbox', checked: s.auto, title: 'Pick a standard length to suit the stack' });
  auto.addEventListener('change', () => { s.auto = auto.checked; rebuild(); });

  return [
    h('h2', {}, 'Screw'),
    field('Type', select<ScrewType>(s.type, entries(SCREW_TYPES), (v) => { s.type = v; })),
    field('Size', select<Size>(s.size, SIZES.map((z): [Size, string] => [z, z]), (v) => {
      s.size = v;
      for (const l of joint.stack) if (l.kind === 'boss') Object.assign(l, bossDefaults(v));
    })),
    field('Length', lengthSelect, h('label', { className: 'check' }, auto, 'Auto')),
    field('Material', text(joint.fastenerMaterial, (v) => { joint.fastenerMaterial = v; })),

    h('h2', {}, 'Stack (head → tip)'),
    ...(joint.stack.length ? [] : [h('p', { className: 'hint' }, 'Add washers, the parts being fastened, and a nut or boss.')]),
    ...joint.stack.map(layerCard),
    h('div', { className: 'add' },
      ...(['washer', 'part', 'nut', 'boss'] as LayerKind[]).map((k) => {
        const b = h('button', {}, `+ ${KIND_NAMES[k]}`);
        b.addEventListener('click', () => { joint.stack.push(makeLayer(k, s.size)); rebuild(); });
        return b;
      })),

    h('h2', {}, 'Drawing'),
    field('View', select(joint.options.view, [['section', 'Cross-section'], ['iso', 'Isometric']],
      (v) => { joint.options.view = v; })),
    ...(joint.options.view === 'iso'
      ? [check('Exploded', joint.options.exploded, (v) => { joint.options.exploded = v; })]
      : [check('Show hidden lines', joint.options.hidden, (v) => { joint.options.hidden = v; })]),
    field('Callouts', select(joint.options.labels, [['balloons', 'Numbered balloons'], ['text', 'Text labels'], ['none', 'None']],
      (v) => { joint.options.labels = v; })),
    field('Callouts on', select(joint.options.calloutSide, [['both', 'Both sides'], ['right', 'Right side']],
      (v) => { joint.options.calloutSide = v; })),
    check('Show title', joint.options.title, (v) => { joint.options.title = v; }),
    check('Show BOM table', joint.options.bom, (v) => { joint.options.bom = v; }),
    check('Include clamped parts in BOM', joint.options.bomParts, (v) => { joint.options.bomParts = v; }),

    h('h2', {}, 'BOM & notes'),
    h('p', { className: 'hint' }, 'Part numbers and renamed descriptions stay with a part until its type or size changes.'),
    ...bomEditor(),
    h('label', { className: 'stacked' }, h('span', {}, 'Notes (one per line)'), notesBox()),
  ];
}

function bomEditor(): HTMLElement[] {
  return [...collectItems(joint).values()].map((item) => {
    const key = item.defaultDesc;
    const o = () => (joint.bomOverrides[key] ??= {});
    const tidy = () => {
      const v = joint.bomOverrides[key];
      if (v && !v.desc && !v.partNo) delete joint.bomOverrides[key];
    };
    const partNo = h('input', { type: 'text', value: item.partNo, placeholder: 'Part no.' });
    partNo.addEventListener('input', () => { o().partNo = partNo.value; tidy(); update(); });
    const rows: Node[] = [h('div', { className: 'bom-head' }, h('strong', {}, `${item.qty}×`), ' ', item.short), partNo];
    if (item.isFastener) {
      const desc = h('input', { type: 'text', value: joint.bomOverrides[key]?.desc ?? '', placeholder: key });
      desc.addEventListener('input', () => { o().desc = desc.value; tidy(); update(); });
      rows.push(desc);
    }
    return h('div', { className: 'bom-item' }, ...rows);
  });
}

function notesBox() {
  const el = h('textarea', { rows: 3, value: joint.notes, placeholder: 'e.g. Tighten to 0.5 Nm' });
  el.addEventListener('input', () => { joint.notes = el.value; update(); });
  return el;
}

const KIND_NAMES: Record<LayerKind, string> = { washer: 'Washer', part: 'Clamped part', nut: 'Nut', boss: 'Tapped boss' };

function layerCard(l: Layer, i: number): HTMLElement {
  const stack = joint.stack;
  const btn = (label: string, title: string, disabled: boolean, fn: () => void) => {
    const b = h('button', { className: 'icon', title, disabled }, label);
    b.addEventListener('click', () => { fn(); rebuild(); });
    return b;
  };
  const swap = (a: number, b: number) => { [stack[a], stack[b]] = [stack[b], stack[a]]; };
  const head = h('div', { className: 'layer-head' },
    h('span', { className: 'idx' }, String(i + 1)),
    h('strong', {}, KIND_NAMES[l.kind]),
    btn('↑', 'Move towards head', i === 0, () => swap(i, i - 1)),
    btn('↓', 'Move towards tip', i === stack.length - 1, () => swap(i, i + 1)),
    btn('✕', 'Remove', false, () => stack.splice(i, 1)),
  );

  let body: Node[] = [];
  switch (l.kind) {
    case 'washer':
      body = [field('Type', select<WasherType>(l.type, entries(WASHER_TYPES), (v) => { l.type = v; }))];
      break;
    case 'nut':
      body = [field('Type', select<NutType>(l.type, entries(NUT_TYPES), (v) => { l.type = v; }))];
      break;
    case 'part': {
      // Keep the label in step with material/thickness unless the user has renamed it.
      const relabel = (fn: () => void) => () => {
        const wasDefault = l.label === defaultPartLabel(l.material, l.thickness);
        fn();
        if (wasDefault) l.label = defaultPartLabel(l.material, l.thickness);
      };
      body = [
        field('Label', text(l.label, (v) => { l.label = v; })),
        field('Material', select<MaterialType>(l.material, entries(MATERIALS), (v) => relabel(() => {
          if (l.thickness === MATERIALS[l.material].thickness) l.thickness = MATERIALS[v].thickness;
          l.material = v;
        })())),
        field('Thickness', num(l.thickness, (v) => relabel(() => { l.thickness = v; })(), { min: 0.1 })),
        field('Hole', select(l.hole, [['clearance', 'Clearance'], ['tapped', 'Tapped']], (v) => { l.hole = v; })),
      ];
      break;
    }
    case 'boss':
      body = [
        field('Label', text(l.label, (v) => { l.label = v; })),
        field('Boss height', num(l.height, (v) => { l.height = v; }, { min: 0.5 })),
        field('Boss Ø', num(l.diameter, (v) => { l.diameter = v; }, { min: 1 })),
        field('Wall', num(l.wall, (v) => { l.wall = v; }, { min: 0.5 })),
        field('Hole depth', num(l.holeDepth, (v) => { l.holeDepth = v; }, { min: 0.5 })),
        check('Heat-set insert (instead of tapped)', !!l.insert, (v) => { l.insert = v; }),
      ];
      break;
  }
  return h('div', { className: 'layer' }, head, ...body);
}

// ---------------------------------------------------------------------------
// File actions

function loadSaved(): Joint | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseJoint(raw) : null;
  } catch {
    return null;
  }
}

const baseName = () => (joint.name.trim() || 'fixing').replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-');

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportPng(scale = 3) {
  const { svg, width, height } = lastSvg;
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = h('canvas', { width: width * scale, height: height * scale });
    canvas.getContext('2d')!.drawImage(img, 0, 0, width * scale, height * scale);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (blob) download(blob, `${baseName()}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

nameInput.addEventListener('input', () => { joint.name = nameInput.value; update(); });
$('new').addEventListener('click', () => {
  if (confirm('Start a new design? Unsaved changes will be lost.')) { joint = defaultJoint(); rebuild(); }
});
$('open').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  try {
    joint = parseJoint(await file.text());
    rebuild();
  } catch (e) {
    alert(`Couldn’t open ${file.name}: ${(e as Error).message}`);
  }
});
$('save').addEventListener('click', () =>
  download(new Blob([JSON.stringify(joint, null, 2)], { type: 'application/json' }), `${baseName()}.fixing.json`));
$('export-svg').addEventListener('click', () =>
  download(new Blob([lastSvg.svg], { type: 'image/svg+xml' }), `${baseName()}.svg`));
$('export-png').addEventListener('click', () => void exportPng());

rebuild();
