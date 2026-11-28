const KEY = 'uac-phobos-pass-v1';
export interface Pass {
  rank: number;
  keys: number;
  best: number;
  waves: number;
  scrap: number;
  commissioned: number;
  upgrades: number[];
  lab: number[];
  slot: number;
  blueprints: number[][];
  bays: number[];
  preset: number;
  records: number[];
  cheats: number;
}
export const fresh = (): Pass => ({
  rank: 0,
  keys: 0,
  best: 0,
  waves: 0,
  scrap: 0,
  commissioned: 0,
  upgrades: [0, 0, 0],
  lab: [0, 1, 2, 3, 0, 1],
  slot: 0,
  blueprints: [
    [0, 1, 2, 3, 0, 1],
    [2, 0, 2, 3, 1, 0],
    [1, 3, 0, 1, 0, 3],
  ],
  bays: [0, 1, 2],
  preset: 0,
  records: [0, 0, 0, 0, 0],
  cheats: 0,
});
const clamp = (v: unknown, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0;
export function readPass(): Pass {
  const p = fresh();
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!v) return p;
    for (const [k, max] of [
      ['rank', 5],
      ['keys', 7],
      ['best', 9999999],
      ['waves', 999],
      ['scrap', 9999],
      ['commissioned', 7],
      ['preset', 2],
      ['slot', 2],
      ['cheats', 3],
    ] as const)
      p[k] = clamp(v[k], max);
    for (const [k, max] of [
      ['upgrades', 3],
      ['lab', 3],
      ['records', 99999],
      ['bays', 4],
    ] as const)
      if (Array.isArray(v[k])) p[k] = p[k].map((_, i) => clamp(v[k][i], max));
    if (Array.isArray(v.blueprints))
      p.blueprints = p.blueprints.map((row, i) =>
        row.map((v0, j) => (Array.isArray(v.blueprints[i]) ? clamp(v.blueprints[i][j], 3) : v0)),
      );
    p.blueprints[p.slot] = [...p.lab];
  } catch {
    /* unavailable storage */
  }
  return p;
}
export function writePass(p: Pass) {
  p.blueprints[p.slot] = [...p.lab];
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new Event('doom-pass'));
}
export function changePass(fn: (p: Pass) => void) {
  const p = readPass();
  fn(p);
  writePass(p);
  return p;
}
