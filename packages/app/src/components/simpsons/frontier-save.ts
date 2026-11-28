import type { Item, Mode } from './frontier-model';
const KEY = 'simpsons-rink-pass-v1';
export const kinds: Item['kind'][] = ['donut', 'rod', 'wave', 'check'];
export const gateTemplate = [0, 1, 2, 3, 0, 1, 2, 3];
export const blank = () => ({
  open: 1,
  medals: [0, 0, 0, 0, 0],
  best: { shift: 0, endless: 0, lab: 0 } as Record<Mode, number>,
  gates: [...gateTemplate],
  builds: Array.from({ length: 3 }, () => ({ gates: [...gateTemplate], profile: 0 })),
  slot: 0,
  precision: 1 as 0 | 1 | 2,
  steps: false,
  tunes: [0, 0, 0] as [number, number, number],
  wallet: 0,
});
export type Pass = ReturnType<typeof blank>;
const num = (v: unknown, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0;
export function readPass(): Pass {
  const p = blank();
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!v) return p;
    p.open = Math.max(1, num(v.open, 5));
    p.steps = v.steps === true;
    p.wallet = num(v.wallet, 9999);
    for (const k of ['lab', 'shift', 'endless'] as const) p.best[k] = num(v.best?.[k], 1e9);
    p.medals = p.medals.map((_, i) => num(v.medals?.[i], 3));
    p.tunes = p.tunes.map((_, i) => num(v.tunes?.[i], 3)) as Pass['tunes'];
    if (v.gates?.length === 8) p.gates = p.gates.map((_, i) => num(v.gates[i], 3));
    p.precision = v.precision === undefined ? 1 : (num(v.precision, 2) as 0 | 1 | 2);
    p.slot = num(v.slot, 2);
    p.builds = p.builds.map((b, i) => ({
      profile: num(v.builds?.[i]?.profile, 2),
      gates: b.gates.map((g, j) =>
        v.builds?.[i]?.gates?.length === 8 ? num(v.builds[i].gates[j], 3) : g,
      ),
    }));
  } catch {
    /* denied storage or older malformed save */
  }
  return p;
}
export function writePass(p: Pass) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode */
  }
  window.dispatchEvent(
    new CustomEvent('simpsons-rink-badge', { detail: p.medals.filter(Boolean).length }),
  );
}
