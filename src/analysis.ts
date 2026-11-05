import { STD_LENGTHS, headDims, sizeData } from './library';
import { bossHoleDepth, bossInsert, placeStack, type Joint, type Placed } from './model';

export interface Analysis {
  warnings: string[];
  /** Standard length that suits the stack, or null if none can be worked out. */
  suggestedLength: number | null;
}

const fmt = (n: number) => `${Math.round(n * 10) / 10} mm`;

/** Finds what the screw threads into and checks the chosen length against it. */
export function analyse(j: Joint): Analysis {
  const sd = sizeData(j.screw.size);
  const { d, P } = sd;
  const placed = placeStack(j);
  const L = j.screw.length;
  const warnings: string[] = [];
  let suggestedLength: number | null = null;

  if (placed.length < j.stack.length) warnings.push('Layers after the boss are ignored.');
  if (j.screw.type === 'csk') {
    const firstOther = placed.findIndex((p) => p.layer.kind !== 'part');
    const seat = firstOther === -1 ? (placed.at(-1)?.y1 ?? 0) : placed[firstOther].y0;
    const k = headDims('csk', sd).k;
    if (placed[0]?.layer.kind !== 'part') {
      warnings.push('A countersunk head needs a clamped part as the first layer to sit in.');
    } else if (seat < k - 1e-6) {
      warnings.push(`The countersunk head is ${fmt(k)} deep but the parts it sits in are only ${fmt(seat)} thick.`);
    }
  }

  const first = placed.findIndex(
    (p) => p.layer.kind === 'nut' || p.layer.kind === 'boss' || (p.layer.kind === 'part' && p.layer.hole === 'tapped'),
  );
  // A nut followed directly by more nuts (e.g. a lock nut) is checked against the last one.
  let last = first;
  while (first >= 0 && placed[first].layer.kind === 'nut' && placed[last + 1]?.layer.kind === 'nut') last++;
  const term: Placed | undefined = first >= 0 ? placed[last] : undefined;

  if (!term) {
    warnings.push('Nothing for the screw to thread into. Add a nut or a boss, or set a part’s hole to tapped.');
  } else if (term.layer.kind === 'nut' && term.layer.type === 'dome') {
    // Blind nut: the tip has to end inside the dome, past the threaded hex.
    const t = term.y1 - term.y0, max = term.y0 + 0.85 * t, min = term.y0 + 0.5 * t;
    if (L > max) warnings.push(`Screw is ${fmt(L - max)} too long for the dome nut and will bottom out.`);
    else if (L < min) warnings.push('Screw too short to engage the dome nut’s full thread.');
    suggestedLength = largestAtMost(max);
  } else if (term.layer.kind === 'nut') {
    if (L < term.y1) warnings.push(`Screw too short: the tip stops ${fmt(term.y1 - L)} short of the end of the nut.`);
    else if (L - term.y1 > Math.max(d, 3)) warnings.push(`Screw protrudes ${fmt(L - term.y1)} past the nut.`);
    suggestedLength = smallestAtLeast(term.y1 + 2 * P);
  } else if (term.layer.kind === 'boss') {
    const ins = bossInsert(term.layer, j.screw.size);
    const bottom = term.y0 + Math.max(bossHoleDepth(term.layer, sd), ins?.len ?? 0);
    const engagement = L - term.y0;
    if (L > bottom) warnings.push(`Screw is ${fmt(L - bottom)} longer than the hole in the boss and will bottom out.`);
    else if (ins && engagement < ins.len * 0.8) warnings.push(`Screw only engages ${fmt(Math.max(0, engagement))} of the ${fmt(ins.len)} insert.`);
    else if (!ins && engagement < d) warnings.push(`Thread engagement is only ${fmt(Math.max(0, engagement))}; aim for at least ${fmt(d)} (1×d).`);
    suggestedLength = largestAtMost(bottom - 0.5);
  } else {
    if (L < term.y0 + Math.min(d, term.y1 - term.y0)) warnings.push('Thread engagement in the tapped part is short.');
    suggestedLength = smallestAtLeast(term.y1);
  }

  return { warnings, suggestedLength };
}

const smallestAtLeast = (v: number) => STD_LENGTHS.find((l) => l >= v - 1e-6) ?? null;
const largestAtMost = (v: number) => [...STD_LENGTHS].reverse().find((l) => l <= v + 1e-6) ?? null;
