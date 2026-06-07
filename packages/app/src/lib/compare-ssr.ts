/**
 * Server-side helpers shared between the `/compare` and `/compare-per-dollar`
 * SSR routes. Extracted from `app/compare/[slug]/page.tsx` (PR #351, PR #382)
 * when the second route was added so the two pages share:
 *
 *   - a single `getCachedBenchmarks` blob slot keyed by dbKeys (one cache
 *     entry per model bucket regardless of which route triggered the fetch),
 *   - the same FIXTURES_MODE / JSON_MODE / Neon ladder,
 *   - the same summary, GPUDataPoint construction, interpolation pipeline,
 *     and JSON-LD shape — with a `variant` knob that swaps the headline
 *     framing between the latency+throughput view and the per-dollar view.
 */
import {
  AUTHOR_NAME,
  AUTHOR_URL,
  HW_REGISTRY,
  SITE_URL,
  sequenceToIslOsl,
} from '@semianalysisai/inferencex-constants';
import { FIXTURES_MODE, JSON_MODE, getDb } from '@semianalysisai/inferencex-db/connection';
import * as jsonProvider from '@semianalysisai/inferencex-db/json-provider';
import {
  type BenchmarkRow,
  getLatestBenchmarks,
} from '@semianalysisai/inferencex-db/queries/benchmarks';

import { interpolateForGPU } from '@/components/calculator/interpolation';
import type { GPUDataPoint, InterpolatedResult } from '@/components/calculator/types';
import { cachedQuery } from '@/lib/api-cache';
import { rowToAggDataEntry } from '@/lib/benchmark-transform';
import { getHardwareKey } from '@/lib/chart-utils';
import {
  canonicalCompareSlug,
  compareDisplayLabel,
  type ComparePair,
  type CompareModelSlug,
  compareModelDisplayLabel,
} from '@/lib/compare-slug';
import { type Lang, compareBasePath } from '@/lib/compare/i18n';
import { getHardwareConfig, getGpuSpecs } from '@/lib/constants';
import { loadFixture } from '@/lib/test-fixtures';

// ---------------------------------------------------------------------------
// Cached benchmark fetch
// ---------------------------------------------------------------------------

/** Cache slot is keyed on the dbKeys array. Both `/compare/<slug>` and
 *  `/compare-per-dollar/<slug>` for the same model hit the same blob entry —
 *  the per-dollar route doesn't duplicate the fetch or the cache. */
export const getCachedBenchmarks = cachedQuery(
  (dbModelKeys: string[]) => {
    if (FIXTURES_MODE) return Promise.resolve(loadFixture<BenchmarkRow[]>('benchmarks'));
    if (JSON_MODE) return Promise.resolve(jsonProvider.getLatestBenchmarks(dbModelKeys));
    return getLatestBenchmarks(getDb(), dbModelKeys);
  },
  'benchmarks',
  { blobOnly: true },
);

// ---------------------------------------------------------------------------
// URL-param validators (shared by both routes' overrides)
// ---------------------------------------------------------------------------

export const KNOWN_MODELS = new Set([
  'Llama-3.3-70B-Instruct-FP8',
  'Llama-3.1-70B-Instruct-FP8-KV',
  'DeepSeek-R1-0528',
  'gpt-oss-120b',
  'Qwen-3.5-397B-A17B',
  'Kimi-K2.5',
  'MiniMax-M2.5',
  'GLM-5',
  'DeepSeek-V4-Pro',
]);
export const KNOWN_SEQUENCES = new Set(['1k/1k', '1k/8k', '8k/1k']);
export const KNOWN_PRECISIONS = new Set(['fp4', 'fp8', 'bf16', 'int4', 'nvfp4', 'mxfp4']);

export function pickString(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

// ---------------------------------------------------------------------------
// Pair summary (JSON-LD additionalProperty)
// ---------------------------------------------------------------------------

export interface PairSummary {
  hardware: string;
  configCount: number;
  bestThroughputPerGpu: number | null;
  bestMedianTtft: number | null;
  bestMedianTpot: number | null;
}

export function summarize(rows: BenchmarkRow[], hw: string): PairSummary {
  const hwRows = rows.filter((r) => r.hardware === hw);
  let bestThroughput: number | null = null;
  let bestTtft: number | null = null;
  let bestTpot: number | null = null;
  for (const row of hwRows) {
    const m = row.metrics ?? {};
    const tput = typeof m.tput_per_gpu === 'number' ? m.tput_per_gpu : null;
    const ttft = typeof m.median_ttft === 'number' ? m.median_ttft : null;
    const tpot = typeof m.median_tpot === 'number' ? m.median_tpot : null;
    if (tput !== null && (bestThroughput === null || tput > bestThroughput)) bestThroughput = tput;
    if (ttft !== null && (bestTtft === null || ttft < bestTtft)) bestTtft = ttft;
    if (tpot !== null && (bestTpot === null || tpot < bestTpot)) bestTpot = tpot;
  }
  return {
    hardware: hw,
    configCount: hwRows.length,
    bestThroughputPerGpu: bestThroughput,
    bestMedianTtft: bestTtft,
    bestMedianTpot: bestTpot,
  };
}

// ---------------------------------------------------------------------------
// GPUDataPoint construction + interpolation pipeline
// ---------------------------------------------------------------------------

/** Cost per million tokens: costPerHour / (tokPerSec * 3600 / 1_000_000) */
const computeGpuCost = (costPerHour: number, tps: number) =>
  costPerHour && tps > 0 ? costPerHour / ((tps * 3600) / 1_000_000) : 0;

export interface SsrInterpolatedRow {
  target: number;
  a: InterpolatedResult | null;
  b: InterpolatedResult | null;
}

function buildGpuDataPoints(
  rows: BenchmarkRow[],
  hw: string,
  isl: number,
  osl: number,
  precision: string,
): GPUDataPoint[] {
  const points: GPUDataPoint[] = [];
  for (const row of rows) {
    if (row.hardware !== hw) continue;
    if (row.isl !== isl || row.osl !== osl) continue;
    if (row.precision !== precision) continue;

    const entry = rowToAggDataEntry(row);
    const hwKey = getHardwareKey(entry);
    if (!getHardwareConfig(hwKey)) continue;

    const m = row.metrics;
    const tput = m.tput_per_gpu ?? 0;
    const outputTput = m.output_tput_per_gpu ?? tput;
    const inputTput = m.input_tput_per_gpu ?? 0;
    const specs = getGpuSpecs(hwKey);
    const power = specs.power;

    points.push({
      hwKey,
      interactivity: m.median_intvty ?? 0,
      throughput: tput,
      outputThroughput: outputTput,
      inputThroughput: inputTput,
      concurrency: row.conc,
      tp: row.decode_tp,
      precision: row.precision,
      ep: row.decode_ep,
      dp_attention: row.decode_dp_attention,
      disagg: row.disagg,
      costh: computeGpuCost(specs.costh, tput),
      costn: computeGpuCost(specs.costn, tput),
      costr: computeGpuCost(specs.costr, tput),
      costhi: computeGpuCost(specs.costh, inputTput),
      costni: computeGpuCost(specs.costn, inputTput),
      costri: computeGpuCost(specs.costr, inputTput),
      costhOutput: computeGpuCost(specs.costh, outputTput),
      costnOutput: computeGpuCost(specs.costn, outputTput),
      costrOutput: computeGpuCost(specs.costr, outputTput),
      tpPerMw: power && power > 0 ? (tput * 1000) / power : 0,
      inputTpPerMw: power && power > 0 ? (inputTput * 1000) / power : 0,
      outputTpPerMw: power && power > 0 ? (outputTput * 1000) / power : 0,
    });
  }
  return points;
}

function interactivityRangeOf(pts: GPUDataPoint[]): { min: number; max: number } | null {
  if (pts.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const p of pts) {
    if (p.interactivity < min) min = p.interactivity;
    if (p.interactivity > max) max = p.interactivity;
  }
  return { min, max };
}

/** Pre-compute interpolated table data for the GPU pair at 3 interactivity
 *  targets (25th, 50th, 75th percentile) within the overlapping range. */
export function computeCompareTableData(
  rows: BenchmarkRow[],
  a: string,
  b: string,
  sequence: string | null,
  precision: string | null,
): {
  defaultTargets: number[];
  ssrRows: SsrInterpolatedRow[];
  interactivityRange: { min: number; max: number };
} {
  const empty = { defaultTargets: [], ssrRows: [], interactivityRange: { min: 0, max: 100 } };
  if (!sequence || !precision) return empty;

  const islOsl = sequenceToIslOsl(sequence);
  if (!islOsl) return empty;

  const pointsA = buildGpuDataPoints(rows, a, islOsl.isl, islOsl.osl, precision);
  const pointsB = buildGpuDataPoints(rows, b, islOsl.isl, islOsl.osl, precision);

  if (pointsA.length === 0 && pointsB.length === 0) return empty;

  const rangeA = interactivityRangeOf(pointsA);
  const rangeB = interactivityRangeOf(pointsB);

  let globalMin: number, globalMax: number;
  if (rangeA && rangeB) {
    globalMin = Math.max(rangeA.min, rangeB.min);
    globalMax = Math.min(rangeA.max, rangeB.max);
    if (globalMin >= globalMax) {
      globalMin = Math.min(rangeA.min, rangeB.min);
      globalMax = Math.max(rangeA.max, rangeB.max);
    }
  } else {
    const r = rangeA ?? rangeB!;
    globalMin = r.min;
    globalMax = r.max;
  }

  const interactivityRange = {
    min: Math.ceil(globalMin),
    max: Math.floor(globalMax),
  };

  const span = globalMax - globalMin;
  const defaultTargets =
    span > 0
      ? [
          Math.round(globalMin + span * 0.25),
          Math.round(globalMin + span * 0.5),
          Math.round(globalMin + span * 0.75),
        ]
      : [Math.round(globalMin)];

  const ssrRows: SsrInterpolatedRow[] = defaultTargets.map((target) => ({
    target,
    a:
      pointsA.length > 0
        ? interpolateForGPU(pointsA, target, 'interactivity_to_throughput', 'costh')
        : null,
    b:
      pointsB.length > 0
        ? interpolateForGPU(pointsB, target, 'interactivity_to_throughput', 'costh')
        : null,
  }));

  return { defaultTargets, ssrRows, interactivityRange };
}

/** Sample the same interpolated cost curve used for the comparison table for
 * server-rendered image assets. More samples make the static PNG read like the
 * interactive roofline without requiring browser-based chart capture.
 *
 * `includeTargets` are merged into the even sampling grid so callers can
 * guarantee the curve has exact samples at specific targets (e.g. the plotted
 * comparison dots), making it safe to partition the curve into solid /
 * dashed segments without interpolation gaps at the boundary. */
export function computeCompareImageRows(
  rows: BenchmarkRow[],
  a: string,
  b: string,
  sequence: string | null,
  precision: string | null,
  interactivityRange: { min: number; max: number },
  includeTargets: number[] = [],
): SsrInterpolatedRow[] {
  if (!sequence || !precision || interactivityRange.max <= interactivityRange.min) return [];

  const islOsl = sequenceToIslOsl(sequence);
  if (!islOsl) return [];

  const pointsA = buildGpuDataPoints(rows, a, islOsl.isl, islOsl.osl, precision);
  const pointsB = buildGpuDataPoints(rows, b, islOsl.isl, islOsl.osl, precision);
  if (pointsA.length === 0 && pointsB.length === 0) return [];

  const sampleCount = 17;
  const span = interactivityRange.max - interactivityRange.min;
  const evenTargets = Array.from(
    { length: sampleCount },
    (_, index) => interactivityRange.min + (span * index) / (sampleCount - 1),
  );
  const clamped = includeTargets.filter(
    (t) => t >= interactivityRange.min && t <= interactivityRange.max,
  );
  const targets = [...new Set([...evenTargets, ...clamped])].toSorted((x, y) => x - y);

  return targets.map((target) => ({
    target,
    a:
      pointsA.length > 0
        ? interpolateForGPU(pointsA, target, 'interactivity_to_throughput', 'costh')
        : null,
    b:
      pointsB.length > 0
        ? interpolateForGPU(pointsB, target, 'interactivity_to_throughput', 'costh')
        : null,
  }));
}

// ---------------------------------------------------------------------------
// JSON-LD graph
// ---------------------------------------------------------------------------

function jsonLdEntryFor(key: string, summary: PairSummary, position: number) {
  const meta = HW_REGISTRY[key];
  const label = meta?.label ?? key.toUpperCase();
  const props: { name: string; value: string | number }[] = [{ name: 'Category', value: 'GPU' }];
  if (meta) {
    props.push({ name: 'Vendor', value: meta.vendor });
    props.push({ name: 'Architecture', value: meta.arch });
    props.push({ name: 'TDP (W)', value: meta.tdp });
  }
  if (summary.bestThroughputPerGpu !== null) {
    props.push({
      name: 'Best Throughput per GPU (tok/s)',
      value: Number(summary.bestThroughputPerGpu.toFixed(2)),
    });
  }
  if (summary.bestMedianTtft !== null) {
    props.push({
      name: 'Best Median TTFT (s)',
      value: Number(summary.bestMedianTtft.toFixed(3)),
    });
  }
  if (summary.bestMedianTpot !== null) {
    props.push({
      name: 'Best Median TPOT (s)',
      value: Number(summary.bestMedianTpot.toFixed(4)),
    });
  }
  props.push({ name: 'Benchmark Configurations', value: summary.configCount });
  return {
    '@type': 'ListItem',
    position,
    item: {
      '@type': 'Thing',
      name: label,
      ...(props.length > 0 && {
        additionalProperty: props.map((p) => ({
          '@type': 'PropertyValue',
          name: p.name,
          value: p.value,
        })),
      }),
    },
  };
}

/** Variant determines the ItemList/Dataset headline framing in JSON-LD.
 *  `'full'` is the /compare page's latency+throughput+cost framing.
 *  `'per-dollar'` is the /compare-per-dollar page's cost-efficiency framing. */
export type CompareJsonLdVariant = 'full' | 'per-dollar';

// ---------------------------------------------------------------------------
// Plain-English table narrative
// ---------------------------------------------------------------------------

/** Format cost as $X.XX or $X.X depending on magnitude. */
function fmtCost(v: number): string {
  if (v >= 10) return `$${v.toFixed(1)}`;
  return `$${v.toFixed(2)}`;
}

/** Round a ratio (always ≥ 1) into a percentage delta, e.g. 1.3 → "30%". */
function fmtPctDelta(ratio: number): string {
  return `${Math.round((ratio - 1) * 100)}%`;
}

/** Deterministic 32-bit-ish string hash. Used to pick a template variant
 *  per (page, row) without `Math.random()` so SSR + hydration agree and the
 *  same URL renders the same prose every request. */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.trunc(Math.imul(31, h) + (s.codePointAt(i) ?? 0));
  }
  return Math.abs(h);
}

/** Bucket the target into low / middle / high segment of the benchmarked
 *  range. Used by templates that say things like "Near the low end" or
 *  "At the upper edge" so the same prose array doesn't all read identically. */
function bandFor(target: number, range: { min: number; max: number }): 'low' | 'middle' | 'high' {
  const span = range.max - range.min;
  if (span <= 0) return 'middle';
  const t = (target - range.min) / span;
  if (t < 1 / 3) return 'low';
  if (t > 2 / 3) return 'high';
  return 'middle';
}

interface PerDollarBoth {
  modelLabel: string;
  aLabel: string;
  bLabel: string;
  cheaper: string;
  pricier: string;
  cheaperCost: number;
  pricierCost: number;
  ratio: number;
  target: number;
  aCost: number;
  bCost: number;
  range: string;
  band: 'low' | 'middle' | 'high';
}

interface FullBoth {
  modelLabel: string;
  aLabel: string;
  bLabel: string;
  cheaper: string;
  faster: string;
  costRatio: number | null; // null when tied or zero-guarded
  tputRatio: number | null;
  costTied: boolean;
  tputTied: boolean;
  target: number;
  aCost: number;
  bCost: number;
  aValue: number;
  bValue: number;
  range: string;
  band: 'low' | 'middle' | 'high';
}

const BAND_PHRASE: Record<'low' | 'middle' | 'high', string> = {
  low: 'near the low end',
  middle: 'around the middle',
  high: 'toward the upper edge',
};

// ---------------------------------------------------------------------------
// /compare-per-dollar variant — both GPUs, no tie, non-zero costs
// ---------------------------------------------------------------------------

const PER_DOLLAR_BOTH_TEMPLATES: ((i: PerDollarBoth) => string)[] = [
  (i) =>
    `At ${i.target} tok/s/user on ${i.modelLabel}, ${i.aLabel} costs ${fmtCost(i.aCost)} per million tokens; ${i.bLabel} costs ${fmtCost(i.bCost)}. ${i.cheaper} is ${fmtPctDelta(i.ratio)} more cost-efficient at this operating point.`,
  (i) =>
    `${i.cheaper} edges ${i.pricier} at ${i.target} tok/s/user on ${i.modelLabel} — ${fmtCost(i.cheaperCost)} per million tokens versus ${fmtCost(i.pricierCost)}, a ${fmtPctDelta(i.ratio)} cost-per-token gap.`,
  (i) =>
    `Push ${i.modelLabel} to ${i.target} tok/s/user and ${i.aLabel} lands at ${fmtCost(i.aCost)} per million tokens against ${i.bLabel}'s ${fmtCost(i.bCost)} — ${i.cheaper} pulls ahead by ${fmtPctDelta(i.ratio)}.`,
  (i) =>
    `${i.aLabel}: ${fmtCost(i.aCost)} per million tokens. ${i.bLabel}: ${fmtCost(i.bCost)}. Both at ${i.target} tok/s/user on ${i.modelLabel}, with ${i.cheaper} ${fmtPctDelta(i.ratio)} cheaper.`,
  (i) =>
    `${BAND_PHRASE[i.band].charAt(0).toUpperCase() + BAND_PHRASE[i.band].slice(1)} of the ${i.range} interactivity band — at ${i.target} tok/s/user — ${i.aLabel} runs ${fmtCost(i.aCost)} per million tokens on ${i.modelLabel} while ${i.bLabel} runs ${fmtCost(i.bCost)}. ${i.cheaper} is the cheaper choice by ${fmtPctDelta(i.ratio)}.`,
  (i) =>
    `On ${i.modelLabel} at ${i.target} tok/s/user, the per-million math comes out to ${fmtCost(i.aCost)} for ${i.aLabel} and ${fmtCost(i.bCost)} for ${i.bLabel}; ${i.cheaper} delivers ${fmtPctDelta(i.ratio)} more output per dollar.`,
];

const PER_DOLLAR_TIED_TEMPLATES: ((i: PerDollarBoth) => string)[] = [
  (i) =>
    `At ${i.target} tok/s/user on ${i.modelLabel}, ${i.aLabel} and ${i.bLabel} land within ~1% on cost per million tokens (${fmtCost(i.aCost)} vs ${fmtCost(i.bCost)}) — call it a tie at this operating point.`,
  (i) =>
    `${i.aLabel} ${fmtCost(i.aCost)} and ${i.bLabel} ${fmtCost(i.bCost)} per million tokens at ${i.target} tok/s/user on ${i.modelLabel}: effectively the same cost.`,
  (i) =>
    `Cost-per-million is essentially even between ${i.aLabel} (${fmtCost(i.aCost)}) and ${i.bLabel} (${fmtCost(i.bCost)}) at ${i.target} tok/s/user on ${i.modelLabel}.`,
];

const PER_DOLLAR_ZERO_TEMPLATES: ((args: {
  modelLabel: string;
  aLabel: string;
  bLabel: string;
  target: number;
  aCost: number;
  bCost: number;
}) => string)[] = [
  (i) =>
    `At ${i.target} tok/s/user on ${i.modelLabel}, ${i.aLabel} and ${i.bLabel} register ${fmtCost(i.aCost)} and ${fmtCost(i.bCost)} per million tokens — one side has missing pricing or throughput, so a like-for-like ratio isn't meaningful here.`,
  (i) =>
    `${i.aLabel} (${fmtCost(i.aCost)}) and ${i.bLabel} (${fmtCost(i.bCost)}) per million tokens at ${i.target} tok/s/user on ${i.modelLabel}: at least one input is zero, so the gap can't be expressed as a ratio.`,
];

const PER_DOLLAR_SINGLE_TEMPLATES: ((args: {
  modelLabel: string;
  presentLabel: string;
  missingLabel: string;
  target: number;
  presentCost: number;
}) => string)[] = [
  (i) =>
    `${i.presentLabel} costs ${fmtCost(i.presentCost)} per million tokens at ${i.target} tok/s/user on ${i.modelLabel}; we have no ${i.missingLabel} benchmark data at this exact target.`,
  (i) =>
    `At ${i.target} tok/s/user on ${i.modelLabel}, ${i.presentLabel} comes in at ${fmtCost(i.presentCost)} per million tokens. ${i.missingLabel} hasn't been benchmarked at this operating point.`,
  (i) =>
    `Only ${i.presentLabel} has cost data at ${i.target} tok/s/user on ${i.modelLabel} — ${fmtCost(i.presentCost)} per million tokens. ${i.missingLabel} is unmeasured at this target.`,
];

// ---------------------------------------------------------------------------
// /compare 'full' variant — both GPUs, mentions cost AND throughput
// ---------------------------------------------------------------------------

function fullSummary(i: FullBoth): string {
  const costPart = i.costTied
    ? 'cost per token is essentially tied'
    : i.costRatio === null
      ? null
      : `${i.cheaper} is ${fmtPctDelta(i.costRatio)} cheaper per token`;
  const tputPart = i.tputTied
    ? 'throughput per GPU is essentially tied'
    : i.tputRatio === null
      ? null
      : `${i.faster} delivers ${fmtPctDelta(i.tputRatio)} more tok/s/GPU`;
  const both = [costPart, tputPart].filter(Boolean).join('; ');
  return both.length > 0
    ? `${both.charAt(0).toUpperCase()}${both.slice(1)}`
    : 'numbers are too close to call';
}

const FULL_BOTH_TEMPLATES: ((i: FullBoth) => string)[] = [
  (i) =>
    `At ${i.target} tok/s/user interactivity on ${i.modelLabel}, ${i.aLabel} delivers ${i.aValue.toFixed(0)} tok/s/GPU at ${fmtCost(i.aCost)} per million tokens; ${i.bLabel} delivers ${i.bValue.toFixed(0)} tok/s/GPU at ${fmtCost(i.bCost)}. ${fullSummary(i)} at this point.`,
  (i) =>
    `${i.aLabel} posts ${i.aValue.toFixed(0)} tok/s/GPU for ${fmtCost(i.aCost)} per million tokens at ${i.target} tok/s/user on ${i.modelLabel}; ${i.bLabel} posts ${i.bValue.toFixed(0)} tok/s/GPU for ${fmtCost(i.bCost)}. ${fullSummary(i)}.`,
  (i) =>
    `Throughput at ${i.target} tok/s/user on ${i.modelLabel}: ${i.aLabel} hits ${i.aValue.toFixed(0)} tok/s/GPU, ${i.bLabel} hits ${i.bValue.toFixed(0)}. Per-million costs land at ${fmtCost(i.aCost)} and ${fmtCost(i.bCost)} respectively. ${fullSummary(i)}.`,
  (i) =>
    `${i.aLabel} / ${i.bLabel} on ${i.modelLabel} at ${i.target} tok/s/user: ${i.aValue.toFixed(0)} / ${i.bValue.toFixed(0)} tok/s/GPU, ${fmtCost(i.aCost)} / ${fmtCost(i.bCost)} per million tokens. ${fullSummary(i)}.`,
  (i) =>
    `${BAND_PHRASE[i.band].charAt(0).toUpperCase() + BAND_PHRASE[i.band].slice(1)} of the ${i.range} interactivity band, at ${i.target} tok/s/user on ${i.modelLabel}: ${i.aLabel} runs ${i.aValue.toFixed(0)} tok/s/GPU at ${fmtCost(i.aCost)}/M tokens, ${i.bLabel} runs ${i.bValue.toFixed(0)} at ${fmtCost(i.bCost)}/M. ${fullSummary(i)}.`,
  (i) =>
    `Setting ${i.target} tok/s/user as the target on ${i.modelLabel}, ${i.aLabel} produces ${i.aValue.toFixed(0)} tok/s/GPU (${fmtCost(i.aCost)} per million tokens) and ${i.bLabel} produces ${i.bValue.toFixed(0)} (${fmtCost(i.bCost)}). ${fullSummary(i)}.`,
];

const FULL_SINGLE_TEMPLATES: ((args: {
  modelLabel: string;
  presentLabel: string;
  missingLabel: string;
  target: number;
  presentValue: number;
  presentCost: number;
}) => string)[] = [
  (i) =>
    `At ${i.target} tok/s/user on ${i.modelLabel}, ${i.presentLabel} delivers ${i.presentValue.toFixed(0)} tok/s/GPU at ${fmtCost(i.presentCost)} per million tokens; ${i.missingLabel} hasn't been benchmarked at this target.`,
  (i) =>
    `${i.presentLabel} hits ${i.presentValue.toFixed(0)} tok/s/GPU for ${fmtCost(i.presentCost)} per million tokens at ${i.target} tok/s/user on ${i.modelLabel}. No ${i.missingLabel} data at this operating point.`,
  (i) =>
    `${i.presentLabel}: ${i.presentValue.toFixed(0)} tok/s/GPU, ${fmtCost(i.presentCost)} per million tokens at ${i.target} tok/s/user on ${i.modelLabel}. ${i.missingLabel} is unmeasured here.`,
];

// ---------------------------------------------------------------------------
// Chinese (zh-CN) narrative templates — 1:1 with the English pools above so the
// `/zh/compare*` pages read the same operating points in natural Chinese.
// Technical units (tok/s/user, tok/s/GPU), currency, and product names stay in
// their original form; only the connective prose is translated.
// ---------------------------------------------------------------------------

const ZH_BAND_PHRASE: Record<'low' | 'middle' | 'high', string> = {
  low: '低端',
  middle: '中段',
  high: '高端',
};

function fullSummaryZh(i: FullBoth): string {
  const costPart = i.costTied
    ? '每 token 成本基本持平'
    : i.costRatio === null
      ? null
      : `${i.cheaper} 每 token 成本低 ${fmtPctDelta(i.costRatio)}`;
  const tputPart = i.tputTied
    ? '每 GPU 吞吐量基本持平'
    : i.tputRatio === null
      ? null
      : `${i.faster} 的每 GPU 吞吐量高出 ${fmtPctDelta(i.tputRatio)}`;
  const both = [costPart, tputPart].filter(Boolean).join('；');
  return both.length > 0 ? both : '差距过小，难分高下';
}

const PER_DOLLAR_BOTH_TEMPLATES_ZH: ((i: PerDollarBoth) => string)[] = [
  (i) =>
    `在 ${i.modelLabel} 上、${i.target} tok/s/user 时，${i.aLabel} 的每百万 token 成本为 ${fmtCost(i.aCost)}，${i.bLabel} 为 ${fmtCost(i.bCost)}。在该工作点，${i.cheaper} 的成本效率高出 ${fmtPctDelta(i.ratio)}。`,
  (i) =>
    `在 ${i.modelLabel} 上、${i.target} tok/s/user 时，${i.cheaper} 略胜 ${i.pricier}——每百万 token ${fmtCost(i.cheaperCost)} 对 ${fmtCost(i.pricierCost)}，每 token 成本相差 ${fmtPctDelta(i.ratio)}。`,
  (i) =>
    `把 ${i.modelLabel} 推到 ${i.target} tok/s/user，${i.aLabel} 的每百万 token 成本落在 ${fmtCost(i.aCost)}，而 ${i.bLabel} 为 ${fmtCost(i.bCost)}——${i.cheaper} 领先 ${fmtPctDelta(i.ratio)}。`,
  (i) =>
    `${i.aLabel}：每百万 token ${fmtCost(i.aCost)}。${i.bLabel}：${fmtCost(i.bCost)}。两者都在 ${i.modelLabel} 上、${i.target} tok/s/user 时测得，其中 ${i.cheaper} 便宜 ${fmtPctDelta(i.ratio)}。`,
  (i) =>
    `在 ${i.range} 交互速率区间的${ZH_BAND_PHRASE[i.band]}——即 ${i.target} tok/s/user——${i.aLabel} 在 ${i.modelLabel} 上的每百万 token 成本为 ${fmtCost(i.aCost)}，${i.bLabel} 为 ${fmtCost(i.bCost)}。${i.cheaper} 是更便宜的选择，低 ${fmtPctDelta(i.ratio)}。`,
  (i) =>
    `在 ${i.modelLabel} 上、${i.target} tok/s/user 时，按每百万 token 计算，${i.aLabel} 为 ${fmtCost(i.aCost)}，${i.bLabel} 为 ${fmtCost(i.bCost)}；${i.cheaper} 每美元能多产出 ${fmtPctDelta(i.ratio)} 的内容。`,
];

const PER_DOLLAR_TIED_TEMPLATES_ZH: ((i: PerDollarBoth) => string)[] = [
  (i) =>
    `在 ${i.modelLabel} 上、${i.target} tok/s/user 时，${i.aLabel} 与 ${i.bLabel} 的每百万 token 成本相差不到 ~1%（${fmtCost(i.aCost)} 对 ${fmtCost(i.bCost)}）——在该工作点可视为打平。`,
  (i) =>
    `在 ${i.modelLabel} 上、${i.target} tok/s/user 时，${i.aLabel} 每百万 token ${fmtCost(i.aCost)}、${i.bLabel} ${fmtCost(i.bCost)}：成本基本相同。`,
  (i) =>
    `在 ${i.modelLabel} 上、${i.target} tok/s/user 时，${i.aLabel}（${fmtCost(i.aCost)}）与 ${i.bLabel}（${fmtCost(i.bCost)}）的每百万 token 成本基本持平。`,
];

const PER_DOLLAR_ZERO_TEMPLATES_ZH: ((args: {
  modelLabel: string;
  aLabel: string;
  bLabel: string;
  target: number;
  aCost: number;
  bCost: number;
}) => string)[] = [
  (i) =>
    `在 ${i.modelLabel} 上、${i.target} tok/s/user 时，${i.aLabel} 与 ${i.bLabel} 分别录得每百万 token ${fmtCost(i.aCost)} 与 ${fmtCost(i.bCost)}——其中一方缺少定价或吞吐数据，因此这里的同口径比值没有意义。`,
  (i) =>
    `在 ${i.modelLabel} 上、${i.target} tok/s/user 时，${i.aLabel}（${fmtCost(i.aCost)}）与 ${i.bLabel}（${fmtCost(i.bCost)}）的每百万 token 成本：至少有一项输入为零，因此无法用比值表达差距。`,
];

const PER_DOLLAR_SINGLE_TEMPLATES_ZH: ((args: {
  modelLabel: string;
  presentLabel: string;
  missingLabel: string;
  target: number;
  presentCost: number;
}) => string)[] = [
  (i) =>
    `在 ${i.modelLabel} 上、${i.target} tok/s/user 时，${i.presentLabel} 的每百万 token 成本为 ${fmtCost(i.presentCost)}；我们在这一精确目标上没有 ${i.missingLabel} 的基准数据。`,
  (i) =>
    `在 ${i.modelLabel} 上、${i.target} tok/s/user 时，${i.presentLabel} 的每百万 token 成本为 ${fmtCost(i.presentCost)}。${i.missingLabel} 尚未在该工作点进行基准测试。`,
  (i) =>
    `在 ${i.modelLabel} 上、${i.target} tok/s/user 时，只有 ${i.presentLabel} 有成本数据——每百万 token ${fmtCost(i.presentCost)}。${i.missingLabel} 在该目标上未做测量。`,
];

const FULL_BOTH_TEMPLATES_ZH: ((i: FullBoth) => string)[] = [
  (i) =>
    `在 ${i.modelLabel} 上、交互速率 ${i.target} tok/s/user 时，${i.aLabel} 提供 ${i.aValue.toFixed(0)} tok/s/GPU、每百万 token ${fmtCost(i.aCost)}；${i.bLabel} 提供 ${i.bValue.toFixed(0)} tok/s/GPU、每百万 token ${fmtCost(i.bCost)}。在该工作点，${fullSummaryZh(i)}。`,
  (i) =>
    `在 ${i.modelLabel} 上、${i.target} tok/s/user 时，${i.aLabel} 录得 ${i.aValue.toFixed(0)} tok/s/GPU、每百万 token ${fmtCost(i.aCost)}；${i.bLabel} 录得 ${i.bValue.toFixed(0)} tok/s/GPU、每百万 token ${fmtCost(i.bCost)}。${fullSummaryZh(i)}。`,
  (i) =>
    `在 ${i.modelLabel} 上、${i.target} tok/s/user 时的吞吐量：${i.aLabel} 达到 ${i.aValue.toFixed(0)} tok/s/GPU，${i.bLabel} 达到 ${i.bValue.toFixed(0)}。每百万 token 成本分别为 ${fmtCost(i.aCost)} 与 ${fmtCost(i.bCost)}。${fullSummaryZh(i)}。`,
  (i) =>
    `${i.aLabel} / ${i.bLabel} 在 ${i.modelLabel} 上、${i.target} tok/s/user 时：${i.aValue.toFixed(0)} / ${i.bValue.toFixed(0)} tok/s/GPU，每百万 token ${fmtCost(i.aCost)} / ${fmtCost(i.bCost)}。${fullSummaryZh(i)}。`,
  (i) =>
    `在 ${i.range} 交互速率区间的${ZH_BAND_PHRASE[i.band]}、即 ${i.modelLabel} 上 ${i.target} tok/s/user 时：${i.aLabel} 跑出 ${i.aValue.toFixed(0)} tok/s/GPU、每百万 token ${fmtCost(i.aCost)}，${i.bLabel} 跑出 ${i.bValue.toFixed(0)}、每百万 token ${fmtCost(i.bCost)}。${fullSummaryZh(i)}。`,
  (i) =>
    `以 ${i.modelLabel} 上 ${i.target} tok/s/user 为目标，${i.aLabel} 产出 ${i.aValue.toFixed(0)} tok/s/GPU（每百万 token ${fmtCost(i.aCost)}），${i.bLabel} 产出 ${i.bValue.toFixed(0)}（每百万 token ${fmtCost(i.bCost)}）。${fullSummaryZh(i)}。`,
];

const FULL_SINGLE_TEMPLATES_ZH: ((args: {
  modelLabel: string;
  presentLabel: string;
  missingLabel: string;
  target: number;
  presentValue: number;
  presentCost: number;
}) => string)[] = [
  (i) =>
    `在 ${i.modelLabel} 上、${i.target} tok/s/user 时，${i.presentLabel} 提供 ${i.presentValue.toFixed(0)} tok/s/GPU、每百万 token ${fmtCost(i.presentCost)}；${i.missingLabel} 尚未在该目标上进行基准测试。`,
  (i) =>
    `在 ${i.modelLabel} 上、${i.target} tok/s/user 时，${i.presentLabel} 达到 ${i.presentValue.toFixed(0)} tok/s/GPU、每百万 token ${fmtCost(i.presentCost)}。该工作点没有 ${i.missingLabel} 的数据。`,
  (i) =>
    `在 ${i.modelLabel} 上、${i.target} tok/s/user 时，${i.presentLabel}：${i.presentValue.toFixed(0)} tok/s/GPU、每百万 token ${fmtCost(i.presentCost)}。${i.missingLabel} 在此未做测量。`,
];

/** Bundle the per-language template pools so `compareTableNarrative` can pick a
 *  set by `lang` without a forest of conditionals at each call site. */
const NARRATIVE_POOLS = {
  en: {
    perDollarBoth: PER_DOLLAR_BOTH_TEMPLATES,
    perDollarTied: PER_DOLLAR_TIED_TEMPLATES,
    perDollarZero: PER_DOLLAR_ZERO_TEMPLATES,
    perDollarSingle: PER_DOLLAR_SINGLE_TEMPLATES,
    fullBoth: FULL_BOTH_TEMPLATES,
    fullSingle: FULL_SINGLE_TEMPLATES,
  },
  zh: {
    perDollarBoth: PER_DOLLAR_BOTH_TEMPLATES_ZH,
    perDollarTied: PER_DOLLAR_TIED_TEMPLATES_ZH,
    perDollarZero: PER_DOLLAR_ZERO_TEMPLATES_ZH,
    perDollarSingle: PER_DOLLAR_SINGLE_TEMPLATES_ZH,
    fullBoth: FULL_BOTH_TEMPLATES_ZH,
    fullSingle: FULL_SINGLE_TEMPLATES_ZH,
  },
} as const;

/** Pick template `rowIndex` in the rotation starting from a per-page hash
 *  offset. Within a single page, paragraphs 0/1/2 always pick three
 *  *consecutive* templates from the pool (never repeating each other), while
 *  the page-level seed picks where in the rotation to start — so different
 *  pages get different starting templates. Avoids the birthday-problem
 *  collisions that pickTemplate alone produces when sampling N times from a
 *  pool of size M near N. */
function pickRotated<T>(arr: T[], pageSeed: string, rowIndex: number): T {
  const start = hashStr(pageSeed) % arr.length;
  return arr[(start + rowIndex) % arr.length];
}

/** Per-route prose summary of the interpolated table — one paragraph per
 *  default interactivity target. Server-rendered into the page HTML so
 *  crawlers and screen-readers get a plain-English read of every operating
 *  point. Returns an empty array when there's no data (caller falls back to
 *  the empty-state UI).
 *
 *  Template selection is deterministic: the same (model, GPU pair, row index,
 *  variant) seed always picks the same template, so SSR and any subsequent
 *  render agree on prose. Different pages pick different templates from the
 *  pool, so the catalog reads with variety instead of repeating the same
 *  sentence shape on every URL.
 *
 *  The returned prose anchors to the SSR'd default model / sequence /
 *  precision — i.e. the slug's canonical operating point. The chart and
 *  interpolated table beneath the narrative re-render on client-side filter
 *  changes; the narrative does not. The caller adds a "(default selection)"
 *  caveat after the last paragraph so a reader who fiddles with the chart
 *  controls sees that the narrative is fixed to the slug's defaults. */
export function compareTableNarrative(
  variant: CompareJsonLdVariant,
  modelLabel: string,
  aLabel: string,
  bLabel: string,
  ssrRows: SsrInterpolatedRow[],
  interactivityRange: { min: number; max: number },
  lang: Lang = 'en',
): string[] {
  if (ssrRows.length === 0) return [];

  const P = NARRATIVE_POOLS[lang] ?? NARRATIVE_POOLS.en;
  const range = `${interactivityRange.min}–${interactivityRange.max} tok/s/user`;
  // Page-level seed: stable across renders, varies by (route variant, model,
  // GPU pair). Template selection rotates by rowIndex from this seed so the
  // 3 paragraphs on a single page never duplicate templates with each other,
  // and different pages pick different starting points in the rotation.
  const pageSeed = `${variant}|${modelLabel}|${aLabel}|${bLabel}`;
  const paragraphs: string[] = [];

  for (const [rowIndex, row] of ssrRows.entries()) {
    const { target, a, b } = row;
    if (!a && !b) continue;
    const band = bandFor(target, interactivityRange);

    if (variant === 'per-dollar') {
      if (a && b) {
        if (!(a.cost > 0 && b.cost > 0)) {
          paragraphs.push(
            pickRotated(
              P.perDollarZero,
              pageSeed,
              rowIndex,
            )({
              modelLabel,
              aLabel,
              bLabel,
              target,
              aCost: a.cost,
              bCost: b.cost,
            }),
          );
          continue;
        }
        const aCheaper = a.cost < b.cost;
        const cheaper = aCheaper ? aLabel : bLabel;
        const pricier = aCheaper ? bLabel : aLabel;
        const ratio = aCheaper ? b.cost / a.cost : a.cost / b.cost;
        const inputs: PerDollarBoth = {
          modelLabel,
          aLabel,
          bLabel,
          cheaper,
          pricier,
          cheaperCost: aCheaper ? a.cost : b.cost,
          pricierCost: aCheaper ? b.cost : a.cost,
          ratio,
          target,
          aCost: a.cost,
          bCost: b.cost,
          range,
          band,
        };
        const pool = ratio < 1.01 ? P.perDollarTied : P.perDollarBoth;
        paragraphs.push(pickRotated(pool, pageSeed, rowIndex)(inputs));
        continue;
      }
      const present = (a ?? b)!;
      paragraphs.push(
        pickRotated(
          P.perDollarSingle,
          pageSeed,
          rowIndex,
        )({
          modelLabel,
          presentLabel: a ? aLabel : bLabel,
          missingLabel: a ? bLabel : aLabel,
          target,
          presentCost: present.cost,
        }),
      );
      continue;
    }

    // 'full' variant
    if (a && b) {
      const costOk = a.cost > 0 && b.cost > 0;
      const tputOk = a.value > 0 && b.value > 0;
      const aCheaper = a.cost < b.cost;
      const aFaster = a.value > b.value;
      const costRatio = costOk ? (aCheaper ? b.cost / a.cost : a.cost / b.cost) : null;
      const tputRatio = tputOk ? (aFaster ? a.value / b.value : b.value / a.value) : null;
      const inputs: FullBoth = {
        modelLabel,
        aLabel,
        bLabel,
        cheaper: aCheaper ? aLabel : bLabel,
        faster: aFaster ? aLabel : bLabel,
        costRatio,
        tputRatio,
        costTied: costOk && costRatio !== null && costRatio < 1.01,
        tputTied: tputOk && tputRatio !== null && tputRatio < 1.01,
        target,
        aCost: a.cost,
        bCost: b.cost,
        aValue: a.value,
        bValue: b.value,
        range,
        band,
      };
      paragraphs.push(pickRotated(P.fullBoth, pageSeed, rowIndex)(inputs));
      continue;
    }
    const present = (a ?? b)!;
    paragraphs.push(
      pickRotated(
        P.fullSingle,
        pageSeed,
        rowIndex,
      )({
        modelLabel,
        presentLabel: a ? aLabel : bLabel,
        missingLabel: a ? bLabel : aLabel,
        target,
        presentValue: present.value,
        presentCost: present.cost,
      }),
    );
  }

  return paragraphs;
}

// ---------------------------------------------------------------------------
// Master-index helpers (shared by /compare and /compare-per-dollar)
// ---------------------------------------------------------------------------

/** "A", "A and B", or "A, B, and C" — Oxford-comma serial join. Used by the
 *  master index ledes on both /compare and /compare-per-dollar so the
 *  enumeration stays consistent if a model is added or removed. */
export function formatModelList(models: CompareModelSlug[], lang: Lang = 'en'): string {
  const labels = models.map((m) => m.label);
  if (lang === 'zh') {
    if (labels.length === 0) return '暂无模型';
    if (labels.length === 1) return labels[0];
    return `${labels.slice(0, -1).join('、')} 和 ${labels.at(-1)}`;
  }
  if (labels.length === 0) return 'no models';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`;
}

export interface VendorBucketEntry {
  a: string;
  b: string;
  slug: string;
  label: string;
}

export interface VendorBuckets {
  /** Cross-vendor pairs (NVIDIA × AMD). */
  cross: VendorBucketEntry[];
  /** Both sides NVIDIA. */
  nvidia: VendorBucketEntry[];
  /** Both sides AMD. */
  amd: VendorBucketEntry[];
}

/** Split (a, b) GPU pairs into vendor buckets for the index grid. The caller
 *  wraps these entries with its own group headings / descriptions / route
 *  prefix — keeps the sorting + bucketing + slug-building in one place so the
 *  two index pages can't drift on those mechanics. */
export function bucketComparePairsByVendor(modelSlug: string, pairs: ComparePair[]): VendorBuckets {
  const nvidia: VendorBucketEntry[] = [];
  const amd: VendorBucketEntry[] = [];
  const cross: VendorBucketEntry[] = [];

  for (const { a, b } of pairs) {
    const entry: VendorBucketEntry = {
      a,
      b,
      slug: canonicalCompareSlug(modelSlug, a, b),
      label: compareDisplayLabel(a, b),
    };
    const vA = HW_REGISTRY[a]?.vendor;
    const vB = HW_REGISTRY[b]?.vendor;
    if (vA === 'NVIDIA' && vB === 'NVIDIA') nvidia.push(entry);
    else if (vA === 'AMD' && vB === 'AMD') amd.push(entry);
    else cross.push(entry);
  }

  return { cross, nvidia, amd };
}

/** Breadcrumb trail for a compare slug page. Emitted alongside the main
 *  Dataset/ItemList JSON-LD so Google can render the Home → Compare → A vs B
 *  trail in search results. Variant chooses /compare vs /compare-per-dollar. */
export function buildBreadcrumbJsonLd(
  variant: CompareJsonLdVariant,
  pairLabel: string,
  url: string,
  lang: Lang = 'en',
) {
  const indexUrl = `${SITE_URL}${compareBasePath(lang, variant)}`;
  const homeName = lang === 'zh' ? '首页' : 'Home';
  const indexName =
    lang === 'zh'
      ? variant === 'per-dollar'
        ? 'GPU 每美元性能'
        : 'GPU 对比'
      : variant === 'per-dollar'
        ? 'GPU Performance per Dollar'
        : 'GPU Comparisons';
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: homeName, item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: indexName, item: indexUrl },
      { '@type': 'ListItem', position: 3, name: pairLabel, item: url },
    ],
  };
}

/** Pick the oldest and newest benchmark dates among rows whose hardware matches
 *  the compared pair — used to populate Dataset.datePublished / dateModified. */
export function dateRangeForPair(
  rows: BenchmarkRow[],
  a: string,
  b: string,
): { oldest?: string; newest?: string } {
  let oldest: string | undefined;
  let newest: string | undefined;
  for (const row of rows) {
    if (row.hardware !== a && row.hardware !== b) continue;
    if (!row.date) continue;
    if (oldest === undefined || row.date < oldest) oldest = row.date;
    if (newest === undefined || row.date > newest) newest = row.date;
  }
  return { oldest, newest };
}

export function buildJsonLd(
  variant: CompareJsonLdVariant,
  model: CompareModelSlug,
  a: string,
  b: string,
  url: string,
  summaryA: PairSummary,
  summaryB: PairSummary,
  ssrRows: SsrInterpolatedRow[],
  imageUrl?: string,
  /** ISO date of oldest benchmark row contributing to this dataset. */
  datePublished?: string,
  /** ISO date of newest benchmark row — drives Google Dataset Search freshness. */
  dateModified?: string,
  /** Display model name accepted by /api/v1/benchmarks?model=…, used to wire the
   *  Dataset's `distribution: DataDownload` to a real machine-readable export. */
  modelApiKey?: string,
  lang: Lang = 'en',
) {
  const aLabel = HW_REGISTRY[a]?.label ?? a.toUpperCase();
  const bLabel = HW_REGISTRY[b]?.label ?? b.toUpperCase();
  const fullLabel = compareModelDisplayLabel(model, a, b);

  const isZh = lang === 'zh';
  const itemListName = isZh
    ? variant === 'per-dollar'
      ? `${fullLabel} —— 每美元性能`
      : `${fullLabel} 推理基准测试`
    : variant === 'per-dollar'
      ? `${fullLabel} — Performance per Dollar`
      : `${fullLabel} Inference Benchmark`;
  const itemListDescription = isZh
    ? variant === 'per-dollar'
      ? `${aLabel} 与 ${bLabel} 在 ${model.label} 上的每百万 token 成本。GPU 性能按自建超大规模数据中心 TCO 在各类 LLM 工作负载下归一化。`
      : `${aLabel} 与 ${bLabel} 在 ${model.label} 上、各类 LLM 工作负载下的 AI 推理基准对比。`
    : variant === 'per-dollar'
      ? `Cost per million tokens of ${aLabel} versus ${bLabel} on ${model.label}. GPU performance normalized by owning-hyperscaler TCO across LLM workloads.`
      : `Head-to-head AI inference benchmark comparison of ${aLabel} and ${bLabel} on ${model.label} across LLM workloads.`;
  const datasetName = isZh
    ? variant === 'per-dollar'
      ? `${aLabel} vs ${bLabel}（${model.label}）每美元性能对比`
      : `${aLabel} vs ${bLabel}（${model.label}）插值基准对比`
    : variant === 'per-dollar'
      ? `${aLabel} vs ${bLabel} (${model.label}) Performance-per-Dollar Comparison`
      : `${aLabel} vs ${bLabel} (${model.label}) Interpolated Benchmark Comparison`;
  const datasetDescription = isZh
    ? variant === 'per-dollar'
      ? `${aLabel} 与 ${bLabel} 在 ${model.label} 上、相同交互速率下的自建超大规模数据中心每百万 token 成本——按美元归一化的推理基准。`
      : `${aLabel} 与 ${bLabel} 在 ${model.label} 上、相同交互速率下的插值吞吐量、成本、能效与并发数。`
    : variant === 'per-dollar'
      ? `Owning-hyperscaler cost per million tokens for ${aLabel} and ${bLabel} on ${model.label} at matched interactivity levels — dollar-normalized inference benchmark.`
      : `Interpolated throughput, cost, power efficiency, and concurrency for ${aLabel} and ${bLabel} on ${model.label} at matched interactivity levels.`;

  const comparisonRows = ssrRows
    .filter((row) => row.a || row.b)
    .map((row) => {
      const metrics: { name: string; value: string }[] = [
        { name: 'Model', value: model.displayName },
        { name: 'Target Interactivity (tok/s/user)', value: String(row.target) },
      ];
      if (row.a) {
        metrics.push(
          { name: `${aLabel} Throughput (tok/s/gpu)`, value: row.a.value.toFixed(1) },
          { name: `${aLabel} Cost ($/M tok)`, value: row.a.cost.toFixed(3) },
          { name: `${aLabel} tok/s/MW`, value: row.a.tpPerMw.toFixed(0) },
          { name: `${aLabel} Concurrency`, value: String(Math.round(row.a.concurrency)) },
        );
      }
      if (row.b) {
        metrics.push(
          { name: `${bLabel} Throughput (tok/s/gpu)`, value: row.b.value.toFixed(1) },
          { name: `${bLabel} Cost ($/M tok)`, value: row.b.cost.toFixed(3) },
          { name: `${bLabel} tok/s/MW`, value: row.b.tpPerMw.toFixed(0) },
          { name: `${bLabel} Concurrency`, value: String(Math.round(row.b.concurrency)) },
        );
      }
      return {
        '@type': 'Dataset',
        name: isZh
          ? `${model.label} 在 ${row.target} tok/s/user 交互速率下的对比`
          : `${model.label} comparison at ${row.target} tok/s/user interactivity`,
        variableMeasured: metrics.map((m) => ({
          '@type': 'PropertyValue',
          name: m.name,
          value: m.value,
        })),
      };
    });

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        name: itemListName,
        description: itemListDescription,
        url,
        ...(imageUrl && { image: imageUrl }),
        itemListOrder: 'https://schema.org/ItemListOrderAscending',
        numberOfItems: 2,
        itemListElement: [jsonLdEntryFor(a, summaryA, 1), jsonLdEntryFor(b, summaryB, 2)],
      },
      ...(comparisonRows.length > 0
        ? [
            {
              '@type': 'Dataset',
              name: datasetName,
              description: datasetDescription,
              url,
              license: 'https://www.apache.org/licenses/LICENSE-2.0',
              isAccessibleForFree: true,
              measurementTechnique:
                'Open-source automated GPU CI/CD inference benchmark (github.com/SemiAnalysisAI/InferenceX)',
              keywords: [
                ...new Set(
                  [
                    'AI inference benchmark',
                    'GPU comparison',
                    variant === 'per-dollar' ? 'cost per million tokens' : 'inference latency',
                    variant === 'per-dollar' ? 'performance per dollar' : 'tokens per second',
                    model.label,
                    aLabel,
                    bLabel,
                    HW_REGISTRY[a]?.vendor,
                    HW_REGISTRY[b]?.vendor,
                  ].filter(Boolean),
                ),
              ].join(', '),
              ...(datePublished && { datePublished }),
              ...(dateModified && { dateModified }),
              creator: {
                '@type': 'Organization',
                name: AUTHOR_NAME,
                url: AUTHOR_URL,
              },
              ...(modelApiKey && {
                distribution: {
                  '@type': 'DataDownload',
                  encodingFormat: 'application/json',
                  contentUrl: `${SITE_URL}/api/v1/benchmarks?model=${encodeURIComponent(modelApiKey)}`,
                  name: `${model.label} latest benchmark rows (JSON)`,
                },
              }),
              ...(imageUrl && {
                image: {
                  '@type': 'ImageObject',
                  contentUrl: imageUrl,
                  caption: datasetName,
                },
              }),
              hasPart: comparisonRows,
            },
          ]
        : []),
    ],
  };
}
