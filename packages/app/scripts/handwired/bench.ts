/**
 * Before/after benchmark: hermiteInterpolate (JS, FP64) vs Handwired networks
 * (ReLU/ReGLU, FP32) on 328 real Pareto frontiers, for each optimization step.
 *
 *   bun run bench:handwired          # JavaScriptCore (Bun)
 *   bun run bench:handwired:node     # V8 (Node)
 *
 * Every measurement runs sequentially in one process (no concurrent timers),
 * with warmup, and reports the median of TRIALS runs.
 */
import fixture from './frontiers.fixture.json';

import { hermiteInterpolate, monotoneSlopes } from '@/components/calculator/interpolation';
import {
  compileHermite,
  hermiteInterpolateHandwired,
  type HermiteNetwork,
  type HermiteOptions,
} from '@/lib/handwired/hermite-circuit';

const TRIALS = 7;
const SAMPLES_PER_FRONTIER = 256;
const TIERS = [30, 50, 75, 100];
/** The TCO-feed pass is sub-millisecond in JS, so repeat it for a stable timer reading. */
const TCO_REPS = 10;

const VARIANTS: { label: string; options: HermiteOptions }[] = [
  { label: 'tensor executor, sign-cascade compares', options: { backend: 'tensor', grid: false } },
  { label: 'tensor executor, grid compares', options: { backend: 'tensor', grid: true } },
  {
    label: 'generated JS, sign-cascade compares, FP32',
    options: { backend: 'generated', grid: false, precision: 'f32' },
  },
  {
    label: 'generated JS, grid compares, FP32',
    options: { backend: 'generated', grid: true, precision: 'f32' },
  },
  {
    label: 'generated JS, grid compares, FP64 (default)',
    options: { backend: 'generated', grid: true },
  },
];

const frontiers = fixture.frontiers.map((f) => ({ ...f, m: monotoneSlopes(f.xs, f.ys) }));
const bun = (globalThis as { Bun?: { version: string } }).Bun;
const runtime = bun === undefined ? `Node ${process.version}` : `Bun ${bun.version}`;

const now = () => performance.now();
const sorted = (v: number[]) => v.toSorted((a, b) => a - b);
const median = (v: number[]) => sorted(v)[Math.floor(v.length / 2)];
const pct = (v: number[], p: number) => sorted(v)[Math.min(v.length - 1, Math.floor(v.length * p))];
const gc = () => {
  (globalThis as { gc?: () => void }).gc?.();
  (globalThis as { Bun?: { gc: (sync: boolean) => void } }).Bun?.gc(true);
};
let sink = 0;

function time(fn: () => void): number {
  fn(); // warmup
  fn();
  const t: number[] = [];
  for (let i = 0; i < TRIALS; i++) {
    const s = now();
    fn();
    t.push(now() - s);
  }
  return median(t);
}

// Sample targets: knots, midpoints, a dense sweep, and points outside the frontier.
const targets = frontiers.map((f) => {
  const lo = f.xs[0];
  const hi = f.xs.at(-1)!;
  const out: number[] = [...f.xs, lo * 0.5, hi * 1.5, ...TIERS];
  for (let i = 0; i + 1 < f.xs.length; i++) out.push((f.xs[i] + f.xs[i + 1]) / 2);
  while (out.length < SAMPLES_PER_FRONTIER)
    out.push(lo + ((hi - lo) * out.length) / SAMPLES_PER_FRONTIER);
  return out;
});
const totalReads = targets.reduce((s, t) => s + t.length, 0);
const reference = frontiers.map((f, i) =>
  targets[i].map((x) => hermiteInterpolate(f.xs, f.ys, f.m, x)),
);

const warmJs = time(() => {
  frontiers.forEach((f, i) => {
    for (const x of targets[i]) sink += hermiteInterpolate(f.xs, f.ys, f.m, x);
  });
});

function measure(options: HermiteOptions) {
  gc();
  const heapBefore = process.memoryUsage().heapUsed;
  const compileMs: number[] = [];
  const nets: HermiteNetwork[] = frontiers.map((f) => {
    const s = now();
    const net = compileHermite(f.xs, f.ys, f.m, options);
    compileMs.push(now() - s);
    return net;
  });
  gc();
  const heapMB = (process.memoryUsage().heapUsed - heapBefore) / 2 ** 20;

  let maxAbs = 0;
  let maxRel = 0;
  let round3 = 0;
  const rel: number[] = [];
  nets.forEach((net, i) => {
    targets[i].forEach((x, k) => {
      const a = reference[i][k];
      const b = net(x);
      const abs = Math.abs(a - b);
      maxAbs = Math.max(maxAbs, abs);
      maxRel = Math.max(maxRel, abs / Math.max(1e-9, Math.abs(a)));
      rel.push(abs / Math.max(1e-9, Math.abs(a)));
      if (Math.round(a * 1000) === Math.round(b * 1000)) round3++;
    });
  });

  const warmMs = time(() => {
    nets.forEach((net, i) => {
      for (const x of targets[i]) sink += net(x);
    });
  });
  return {
    warmMs,
    perReadNs: (warmMs / totalReads) * 1e6,
    compileMs: median(compileMs),
    compileP95: pct(compileMs, 0.95),
    layers: median(nets.map((n) => n.layerCount)),
    ops: median(nets.map((n) => n.operationCount)),
    weights: median(nets.map((n) => n.weightCount)),
    heapMB,
    maxAbs,
    maxRel,
    p99Rel: pct(rel, 0.99),
    round3: round3 / totalReads,
  };
}

const results = VARIANTS.map((v) => ({ ...v, ...measure(v.options) }));

// TCO-feed shape: 4 tier reads per frontier, slopes recomputed, fresh arrays each pass.
const tco = (read: (xs: number[], ys: number[], m: number[], x: number) => number) =>
  time(() => {
    for (let r = 0; r < TCO_REPS; r++)
      for (const f of frontiers) {
        const xs = [...f.xs];
        const ys = [...f.ys];
        const m = monotoneSlopes(xs, ys);
        for (const tier of TIERS) sink += read(xs, ys, m, tier);
      }
  }) / TCO_REPS;
const tcoJs = tco(hermiteInterpolate);
const tcoUncached = tco((xs, ys, m, x) => compileHermite(xs, ys, m)(x));
const tcoCached = tco(hermiteInterpolateHandwired); // warmup fills the content cache

const fmt = (n: number, d = 2) =>
  n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const jsNs = (warmJs / totalReads) * 1e6;

console.log(`\n## Handwired hermite benchmark — ${runtime}\n`);
console.log(
  `${frontiers.length} real frontiers, ${totalReads.toLocaleString()} reads, median of ${TRIALS} trials\n`,
);
console.log(
  '| variant | read | vs JS | layers | neurons | weights | compile | heap (328 nets) | max rel err | round3 match |',
);
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
console.log(
  `| JS hermiteInterpolate (FP64) | ${fmt(jsNs, 1)} ns | 1.0x | — | — | ~21 numbers | — | — | 0 | 100% |`,
);
for (const r of results)
  console.log(
    `| ${r.label} | ${fmt(r.perReadNs, 1)} ns | ${fmt(r.perReadNs / jsNs, 1)}x | ${r.layers} | ${r.ops} | ${r.weights} | ${fmt(r.compileMs, 3)} ms | ${fmt(r.heapMB, 1)} MB | ${r.maxRel.toExponential(1)} | ${fmt(r.round3 * 100, 1)}% |`,
  );
console.log('\n| TCO-feed shape (328 frontiers × 4 tiers) | time | vs JS |');
console.log('| --- | --- | --- |');
console.log(`| JS | ${fmt(tcoJs, 3)} ms | 1.0x |`);
console.log(
  `| network, compiled on every call | ${fmt(tcoUncached, 2)} ms | ${fmt(tcoUncached / tcoJs, 0)}x |`,
);
console.log(
  `| network, content-keyed cache (steady state) | ${fmt(tcoCached, 3)} ms | ${fmt(tcoCached / tcoJs, 1)}x |`,
);
console.log(
  `\n<details><summary>raw</summary>\n\n\`\`\`json\n${JSON.stringify({ runtime, warmJs, jsNs, results, tcoJs, tcoUncached, tcoCached }, null, 2)}\n\`\`\`\n</details>`,
);
if (sink === 42) console.log('');
