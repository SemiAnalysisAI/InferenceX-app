/**
 * Before/after benchmark: hermiteInterpolate (JS, FP64) vs the Handwired network
 * (ReLU/ReGLU tensor program, FP32) on 328 real Pareto frontiers.
 *
 *   bun scripts/handwired/bench.ts            # JavaScriptCore (Bun)
 *   bun run bench:handwired:node              # V8 (Node), see package.json
 *
 * Every measurement runs sequentially in one process (no concurrent timers),
 * with warmup, and reports the median of TRIALS runs.
 */
import fixture from './frontiers.fixture.json';

import { hermiteInterpolate, monotoneSlopes } from '@/components/calculator/interpolation';
import { compileHermite, type HermiteNetwork } from '@/lib/handwired/hermite-circuit';

const TRIALS = 7;
const SAMPLES_PER_FRONTIER = 256;
const TIERS = [30, 50, 75, 100];
/** The TCO-feed pass is sub-millisecond in JS, so repeat it to get a stable timer reading. */
const TCO_REPS = 10;

const frontiers = fixture.frontiers.map((f) => ({ ...f, m: monotoneSlopes(f.xs, f.ys) }));
const bun = (globalThis as { Bun?: { version: string } }).Bun;
const runtime = bun === undefined ? `Node ${process.version}` : `Bun ${bun.version}`;

const now = () => performance.now();
const median = (v: number[]) => v.toSorted((a, b) => a - b)[Math.floor(v.length / 2)];
const pct = (v: number[], p: number) =>
  v.toSorted((a, b) => a - b)[Math.min(v.length - 1, Math.floor(v.length * p))];
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

// ── 1. Network size and compile cost ─────────────────────────────────────────
const heapBefore = process.memoryUsage().heapUsed;
const compileMs: number[] = [];
const nets: HermiteNetwork[] = frontiers.map((f) => {
  const s = now();
  const net = compileHermite(f.xs, f.ys, f.m);
  compileMs.push(now() - s);
  return net;
});
(globalThis as { gc?: () => void }).gc?.();
const heapAfter = process.memoryUsage().heapUsed;
const weights = nets.map((n) => n.weightCount);
const layers = nets.map((n) => n.layerCount);
const ops = nets.map((n) => n.operationCount);

// ── 2. Accuracy ──────────────────────────────────────────────────────────────
let maxAbs = 0;
let maxRel = 0;
let exactAfterRound3 = 0;
let reads = 0;
const relErrors: number[] = [];
frontiers.forEach((f, i) => {
  for (const x of targets[i]) {
    const a = hermiteInterpolate(f.xs, f.ys, f.m, x);
    const b = nets[i](x);
    const abs = Math.abs(a - b);
    const rel = abs / Math.max(1e-9, Math.abs(a));
    maxAbs = Math.max(maxAbs, abs);
    maxRel = Math.max(maxRel, rel);
    relErrors.push(rel);
    if (Math.round(a * 1000) === Math.round(b * 1000)) exactAfterRound3++;
    reads++;
  }
});

// ── 3. Warm per-read latency (network already compiled) ──────────────────────
const warmJs = time(() => {
  frontiers.forEach((f, i) => {
    for (const x of targets[i]) sink += hermiteInterpolate(f.xs, f.ys, f.m, x);
  });
});
const warmHw = time(() => {
  nets.forEach((net, i) => {
    for (const x of targets[i]) sink += net(x);
  });
});

// ── 4. TCO-feed shape: 4 tier reads per frontier, cold (compile included) ────
const tcoJs =
  time(() => {
    for (let r = 0; r < TCO_REPS; r++)
      for (const f of frontiers) {
        const m = monotoneSlopes(f.xs, f.ys);
        for (const tier of TIERS) sink += hermiteInterpolate(f.xs, f.ys, m, tier);
      }
  }) / TCO_REPS;
const tcoHw =
  time(() => {
    for (let r = 0; r < TCO_REPS; r++)
      for (const f of frontiers) {
        const m = monotoneSlopes(f.xs, f.ys);
        const net = compileHermite(f.xs, f.ys, m);
        for (const tier of TIERS) sink += net(tier);
      }
  }) / TCO_REPS;

// ── 5. Break-even: reads per frontier before compile cost is amortized ───────
const jsPerRead = warmJs / totalReads;
const hwPerRead = warmHw / totalReads;
const compilePerNet = median(compileMs);

const fmt = (n: number, d = 2) =>
  n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const ns = (ms: number) => `${fmt(ms * 1e6, 1)} ns`;
const report = {
  runtime,
  frontiers: frontiers.length,
  reads: totalReads,
  network: {
    weights: {
      min: Math.min(...weights),
      median: median(weights),
      max: Math.max(...weights),
      total: weights.reduce((a, b) => a + b, 0),
    },
    layers: { min: Math.min(...layers), median: median(layers), max: Math.max(...layers) },
    operations: { min: Math.min(...ops), median: median(ops), max: Math.max(...ops) },
    heapMB: (heapAfter - heapBefore) / 2 ** 20,
  },
  compileMs: {
    median: compilePerNet,
    p95: pct(compileMs, 0.95),
    total: compileMs.reduce((a, b) => a + b, 0),
  },
  accuracy: { maxAbs, maxRel, p99Rel: pct(relErrors, 0.99), round3Match: exactAfterRound3 / reads },
  warm: { jsMs: warmJs, hwMs: warmHw, jsPerRead, hwPerRead, slowdown: warmHw / warmJs },
  tcoFeedCold: { jsMs: tcoJs, hwMs: tcoHw, slowdown: tcoHw / tcoJs },
  breakEvenReads: hwPerRead > jsPerRead ? Infinity : compilePerNet / (jsPerRead - hwPerRead),
};

console.log(`\n## Handwired hermite benchmark — ${runtime}\n`);
console.log(
  `${report.frontiers} real frontiers, ${report.reads.toLocaleString()} reads, median of ${TRIALS} trials\n`,
);
console.log('| metric | before (JS) | after (Handwired) | change |');
console.log('| --- | --- | --- | --- |');
console.log(
  `| warm read latency | ${ns(jsPerRead)} | ${ns(hwPerRead)} | ${fmt(report.warm.slowdown, 1)}x slower |`,
);
console.log(
  `| warm sweep, ${report.reads.toLocaleString()} reads | ${fmt(warmJs)} ms | ${fmt(warmHw)} ms | ${fmt(report.warm.slowdown, 1)}x |`,
);
console.log(
  `| TCO feed shape (328 × 4 tiers, cold) | ${fmt(tcoJs)} ms | ${fmt(tcoHw)} ms | ${fmt(report.tcoFeedCold.slowdown, 0)}x slower |`,
);
console.log(
  `| compile per frontier | 0 | ${fmt(compilePerNet, 3)} ms (p95 ${fmt(report.compileMs.p95, 3)}) | — |`,
);
console.log(
  `| weights per frontier | ~${Math.round(median(frontiers.map((f) => f.xs.length * 3)))} numbers (xs, ys, m) | ${report.network.weights.median} (range ${report.network.weights.min}–${report.network.weights.max}) | — |`,
);
console.log(
  `| network depth | 1 binary search | ${report.network.layers.median} layers (range ${report.network.layers.min}–${report.network.layers.max}) | — |`,
);
console.log(
  `| neurons (live ops) | — | ${report.network.operations.median} (range ${report.network.operations.min}–${report.network.operations.max}) | — |`,
);
console.log(`| heap for 328 compiled nets | 0 | ${fmt(report.network.heapMB, 1)} MB | — |`);
console.log(`| max abs error vs FP64 | 0 | ${maxAbs.toExponential(2)} tok/s | — |`);
console.log(
  `| max / p99 rel error | 0 | ${maxRel.toExponential(2)} / ${report.accuracy.p99Rel.toExponential(2)} | — |`,
);
console.log(
  `| reads identical after round3 (TCO feed rounding) | 100% | ${fmt(report.accuracy.round3Match * 100, 2)}% | — |`,
);
console.log(
  `| break-even reads per frontier | — | ${Number.isFinite(report.breakEvenReads) ? fmt(report.breakEvenReads, 0) : 'never (warm read is slower)'} | — |`,
);
console.log(
  `\n<details><summary>raw</summary>\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n</details>`,
);
if (sink === 42) console.log('');
