/**
 * Snapshot real Pareto frontiers from the public API into a small fixture so the
 * Handwired benchmark is reproducible offline.
 *
 *   bun scripts/handwired/build-fixture.ts
 */
import { writeFileSync } from 'node:fs';

import { paretoFrontUpperLeft } from '@/components/calculator/interpolation';

const MODELS = [
  'DeepSeek-R1-0528',
  'gpt-oss-120b',
  'Llama-3.3-70B-Instruct-FP8',
  'Qwen-3.5-397B-A17B',
];
const API = 'https://inferencex.semianalysis.com/api/v1/benchmarks';

interface Row {
  hardware: string;
  framework: string;
  precision: string;
  spec_method: string;
  disagg: boolean;
  isl: number | null;
  osl: number | null;
  metrics: Record<string, number>;
}

const frontiers: { key: string; xs: number[]; ys: number[] }[] = [];
for (const model of MODELS) {
  const response = await fetch(`${API}?model=${encodeURIComponent(model)}`);
  const rows = (await response.json()) as Row[];
  const groups = new Map<string, { x: number; y: number }[]>();
  for (const r of rows) {
    const x = r.metrics.median_intvty;
    const y = r.metrics.output_tput_per_gpu;
    if (!(x > 0 && y > 0)) continue;
    const key = [
      model,
      r.hardware,
      r.framework,
      r.precision,
      r.spec_method,
      r.disagg ? 'disagg' : 'agg',
      `${r.isl}x${r.osl}`,
    ].join('|');
    (groups.get(key) ?? groups.set(key, []).get(key)!).push({ x, y });
  }
  for (const [key, pts] of groups) {
    const front = paretoFrontUpperLeft(
      pts,
      (p) => p.x,
      (p) => p.y,
    ).toSorted((a, b) => a.x - b.x);
    if (front.length < 2) continue;
    frontiers.push({ key, xs: front.map((p) => p.x), ys: front.map((p) => p.y) });
  }
}
const out = new URL('frontiers.fixture.json', import.meta.url);
writeFileSync(
  out,
  `${JSON.stringify({ capturedAt: new Date().toISOString(), source: API, frontiers })}\n`,
);
console.log(`wrote ${frontiers.length} frontiers to ${out.pathname}`);
