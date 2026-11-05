import { buildBom, collectItems } from '../bom';
import type { Joint } from '../model';
import { annotate } from './annotate';
import { renderIso } from './iso';
import { renderSection } from './section';
import { toSvg } from './svg';

/** Full drawing (chosen view + callouts + BOM) as a standalone SVG string. */
export function renderJoint(j: Joint) {
  const view = j.options.view === 'iso' ? renderIso(j) : renderSection(j);
  const items = collectItems(j);
  const bom = buildBom(j, items);
  const notes = annotate(j, view.prims, view.anchors, items, bom);
  return toSvg([...view.prims, ...notes]);
}
