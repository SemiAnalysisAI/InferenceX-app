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
import { HW_REGISTRY, sequenceToIslOsl } from '@semianalysisai/inferencex-constants';
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
// Pair summary (JSON-LD Product additionalProperty)
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

// ---------------------------------------------------------------------------
// JSON-LD graph
// ---------------------------------------------------------------------------

function jsonLdEntryFor(key: string, summary: PairSummary, position: number) {
  const meta = HW_REGISTRY[key];
  const label = meta?.label ?? key.toUpperCase();
  const props: { name: string; value: string | number }[] = [];
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
      '@type': 'Product',
      name: label,
      brand: { '@type': 'Brand', name: meta?.vendor ?? 'Unknown' },
      category: 'GPU',
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

/** Per-route prose summary of the interpolated table. Server-rendered into
 *  the page HTML so crawlers and screen-readers get a plain-English read of
 *  the headline number alongside the table data. Returns null when there's
 *  no comparable data to describe (caller falls back to the empty-state UI).
 *
 *  Picks the first interactivity target where both GPUs have data (those are
 *  the points readers care about), or falls back to a single-GPU description
 *  at the mid row if there's no overlap. Template differs by variant —
 *  `'full'` mentions both cost and throughput; `'per-dollar'` focuses on cost
 *  and references the table for the rest.
 *
 *  The returned prose anchors to the SSR'd default model / sequence /
 *  precision — i.e. the slug's canonical operating point. The chart and
 *  interpolated table beneath the narrative re-render on client-side filter
 *  changes; the narrative does not. This is intentional: the URL slug *is*
 *  the canonical view, and the narrative is the canonical view's prose
 *  summary. The caller adds a small "(default configuration)" caveat after
 *  the narrative so a reader who fiddles with the chart controls sees that
 *  the narrative is fixed to the slug's defaults. */
export function compareTableNarrative(
  variant: CompareJsonLdVariant,
  modelLabel: string,
  aLabel: string,
  bLabel: string,
  ssrRows: SsrInterpolatedRow[],
  interactivityRange: { min: number; max: number },
): string | null {
  if (ssrRows.length === 0) return null;

  const both = ssrRows.find((r) => r.a && r.b);
  const row = both ?? ssrRows[Math.floor(ssrRows.length / 2)];
  const { target, a, b } = row;
  if (!a && !b) return null;

  const range = `${interactivityRange.min}–${interactivityRange.max} tok/s/user`;

  if (variant === 'per-dollar') {
    if (a && b) {
      // Guard against zero costs (HW_REGISTRY.costh == 0 or zero throughput
      // upstream): the ratio math would emit Infinity / NaN. Fall through to
      // a values-only summary instead of dividing.
      if (!(a.cost > 0 && b.cost > 0)) {
        return `On ${modelLabel}, ${aLabel} and ${bLabel} register cost-per-token values of ${fmtCost(a.cost)} and ${fmtCost(b.cost)} respectively at ${target} tok/s/user interactivity. At least one side has missing pricing or throughput data, so a like-for-like ratio isn't meaningful at this point — see the interpolated table below for targets with both inputs populated.`;
      }
      const aCheaper = a.cost < b.cost;
      const cheaper = aCheaper ? aLabel : bLabel;
      const pricier = aCheaper ? bLabel : aLabel;
      const ratio = aCheaper ? b.cost / a.cost : a.cost / b.cost;
      // Within ~1% the cost is effectively tied — say so rather than rounding
      // to "0% more cost-efficient" which reads wrong.
      if (ratio < 1.01) {
        return `On ${modelLabel}, ${aLabel} and ${bLabel} land within ~1% of each other on cost per million tokens at ${target} tok/s/user interactivity (${fmtCost(a.cost)} vs. ${fmtCost(b.cost)}). Across the ${range} interactivity range we benchmarked, see the interpolated table below for the points where one pulls ahead.`;
      }
      return `On ${modelLabel}, ${aLabel} costs ${fmtCost(a.cost)} per million tokens at ${target} tok/s/user interactivity; ${bLabel} costs ${fmtCost(b.cost)} per million tokens at the same target. ${cheaper} is ${fmtPctDelta(ratio)} more cost-efficient than ${pricier} at this operating point — across the ${range} interactivity range we benchmarked, see the interpolated table below for how the gap moves across the full Pareto frontier.`;
    }
    const present = (a ?? b)!;
    const presentLabel = a ? aLabel : bLabel;
    const missingLabel = a ? bLabel : aLabel;
    return `On ${modelLabel}, ${presentLabel} costs ${fmtCost(present.cost)} per million tokens at ${target} tok/s/user interactivity. We don't have ${missingLabel} benchmark data at this exact operating point — see the interpolated table below for the targets where both GPUs are measurable.`;
  }

  // 'full' variant — mention cost AND throughput
  if (a && b) {
    // Two independent comparisons (cost, throughput): tie-handling and
    // zero-guard applied separately so a tie on one dimension doesn't
    // suppress the other side of the sentence.
    const costPart = (() => {
      if (!(a.cost > 0 && b.cost > 0)) return null;
      const aCheaper = a.cost < b.cost;
      const cheaper = aCheaper ? aLabel : bLabel;
      const ratio = aCheaper ? b.cost / a.cost : a.cost / b.cost;
      if (ratio < 1.01) return 'cost per token is essentially tied';
      return `${cheaper} is ${fmtPctDelta(ratio)} cheaper per token`;
    })();
    const tputPart = (() => {
      if (!(a.value > 0 && b.value > 0)) return null;
      const aFaster = a.value > b.value;
      const faster = aFaster ? aLabel : bLabel;
      const ratio = aFaster ? a.value / b.value : b.value / a.value;
      if (ratio < 1.01) return 'throughput per GPU is essentially tied';
      return `${faster} delivers ${fmtPctDelta(ratio)} more tok/s/GPU`;
    })();
    const summary = [costPart, tputPart].filter(Boolean).join('; ');
    const summarySentence = summary
      ? ` ${summary.charAt(0).toUpperCase() + summary.slice(1)} at this operating point — `
      : ' ';
    return `On ${modelLabel}, at ${target} tok/s/user interactivity (within the ${range} range benchmarked), ${aLabel} delivers ${a.value.toFixed(0)} tok/s/GPU at ${fmtCost(a.cost)} per million tokens, while ${bLabel} delivers ${b.value.toFixed(0)} tok/s/GPU at ${fmtCost(b.cost)} per million tokens.${summarySentence}use the interpolated table below to see how the comparison shifts at higher and lower interactivity.`;
  }
  const present = (a ?? b)!;
  const presentLabel = a ? aLabel : bLabel;
  const missingLabel = a ? bLabel : aLabel;
  return `On ${modelLabel}, ${presentLabel} delivers ${present.value.toFixed(0)} tok/s/GPU at ${fmtCost(present.cost)} per million tokens at ${target} tok/s/user interactivity. We don't have ${missingLabel} benchmark data at this exact operating point — see the interpolated table below for the targets where both GPUs are measurable.`;
}

// ---------------------------------------------------------------------------
// Master-index helpers (shared by /compare and /compare-per-dollar)
// ---------------------------------------------------------------------------

/** "A", "A and B", or "A, B, and C" — Oxford-comma serial join. Used by the
 *  master index ledes on both /compare and /compare-per-dollar so the
 *  enumeration stays consistent if a model is added or removed. */
export function formatModelList(models: CompareModelSlug[]): string {
  const labels = models.map((m) => m.label);
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

export function buildJsonLd(
  variant: CompareJsonLdVariant,
  model: CompareModelSlug,
  a: string,
  b: string,
  url: string,
  summaryA: PairSummary,
  summaryB: PairSummary,
  ssrRows: SsrInterpolatedRow[],
) {
  const aLabel = HW_REGISTRY[a]?.label ?? a.toUpperCase();
  const bLabel = HW_REGISTRY[b]?.label ?? b.toUpperCase();
  const fullLabel = compareModelDisplayLabel(model, a, b);

  const itemListName =
    variant === 'per-dollar'
      ? `${fullLabel} — Performance per Dollar`
      : `${fullLabel} Inference Benchmark`;
  const itemListDescription =
    variant === 'per-dollar'
      ? `Cost per million tokens of ${aLabel} versus ${bLabel} on ${model.label}. GPU performance normalized by owning-hyperscaler TCO across LLM workloads.`
      : `Head-to-head AI inference benchmark comparison of ${aLabel} and ${bLabel} on ${model.label} across LLM workloads.`;
  const datasetName =
    variant === 'per-dollar'
      ? `${aLabel} vs ${bLabel} (${model.label}) Performance-per-Dollar Comparison`
      : `${aLabel} vs ${bLabel} (${model.label}) Interpolated Benchmark Comparison`;
  const datasetDescription =
    variant === 'per-dollar'
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
        '@type': 'Observation',
        name: `${model.label} comparison at ${row.target} tok/s/user interactivity`,
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
              hasPart: comparisonRows,
            },
          ]
        : []),
    ],
  };
}
