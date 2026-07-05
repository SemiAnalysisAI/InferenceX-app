/**
 * Server-side helpers for the /compare-precision and /compare-spec-decode
 * SSR routes. Mirrors the shape of compare-ssr.ts but both sides share ONE
 * hardware and differ by variant dimension (precision or speculative decoding).
 *
 * - computeVariantCompareTableData: same interpolation pipeline as
 *   computeCompareTableData but filtering each side by its VariantCompareSide.
 * - pickVariantPairDefaults: overlap-maximising (sequence, precision) defaults
 *   adapted from compare-pair-defaults.ts for variant dimensions.
 * - variantCompareNarrative: deterministic English prose, 3-4 templates per pool.
 * - buildVariantJsonLd / buildVariantBreadcrumbJsonLd: structured data.
 */
import {
  AUTHOR_NAME,
  AUTHOR_URL,
  HW_REGISTRY,
  SITE_URL,
  islOslToSequence,
  sequenceToIslOsl,
} from '@semianalysisai/inferencex-constants';
import type { BenchmarkRow } from '@semianalysisai/inferencex-db/queries/benchmarks';

import { interpolateForGPU } from '@/components/calculator/interpolation';
import type { GPUDataPoint } from '@/components/calculator/types';
import type { CompareModelSlug } from '@/lib/compare-slug';
import {
  BAND_PHRASE,
  bandFor,
  buildGpuDataPoints,
  fmtCost,
  fmtPctDelta,
  type PairSummary,
  pickRotated,
  type SsrInterpolatedRow,
} from '@/lib/compare-ssr';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VariantCompareKind = 'precision' | 'spec-decode';

export interface VariantCompareSide {
  precision?: string;
  specMethod?: string;
}

// ---------------------------------------------------------------------------
// Data point construction helpers
// ---------------------------------------------------------------------------

/** Build GPUDataPoints for one side of a variant comparison.
 *  For kind='precision': side = {precision}, no specMethod filter.
 *  For kind='spec-decode': side = {specMethod, precision}. */
function buildSidePoints(
  rows: BenchmarkRow[],
  hw: string,
  isl: number,
  osl: number,
  side: VariantCompareSide,
): GPUDataPoint[] {
  // A side without a concrete precision matches nothing — mirrors the existing
  // compare pages, where a null pickPairDefaults precision yields an empty
  // table rather than silently defaulting to one precision.
  if (side.precision === null || side.precision === undefined) return [];
  return buildGpuDataPoints(rows, hw, isl, osl, side.precision, side.specMethod);
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

// ---------------------------------------------------------------------------
// pickVariantPairDefaults
// ---------------------------------------------------------------------------

export function pickVariantPairDefaults(
  kind: VariantCompareKind,
  rows: BenchmarkRow[],
  hw: string,
  sideA: VariantCompareSide,
  sideB: VariantCompareSide,
): { sequence: string | null; precision: string | null } {
  const hwRows = rows.filter((r) => r.hardware === hw);
  if (hwRows.length === 0) return { sequence: null, precision: null };

  if (kind === 'precision') {
    // Bucket by sequence only; variantId = framework|spec_method|conc.
    // Count variants present in BOTH precision buckets.
    const seenA = new Map<string, Set<string>>();
    const seenB = new Map<string, Set<string>>();
    for (const row of hwRows) {
      if (row.isl === null || row.osl === null) continue;
      const seq = islOslToSequence(row.isl, row.osl);
      if (!seq) continue;
      const variantId = `${row.framework}|${row.spec_method}|${row.conc}`;
      if (row.precision === sideA.precision) {
        if (!seenA.has(seq)) seenA.set(seq, new Set());
        seenA.get(seq)!.add(variantId);
      }
      if (row.precision === sideB.precision) {
        if (!seenB.has(seq)) seenB.set(seq, new Set());
        seenB.get(seq)!.add(variantId);
      }
    }
    const tally = new Map<string, { both: number; either: number }>();
    for (const key of new Set([...seenA.keys(), ...seenB.keys()])) {
      const aSet = seenA.get(key) ?? new Set<string>();
      const bSet = seenB.get(key) ?? new Set<string>();
      let both = 0;
      for (const v of aSet) if (bSet.has(v)) both++;
      tally.set(key, { both, either: aSet.size + bSet.size });
    }
    if (tally.size === 0) return { sequence: null, precision: null };
    const best = [...tally.entries()].toSorted((left, right) => {
      if (left[1].both !== right[1].both) return right[1].both - left[1].both;
      return right[1].either - left[1].either;
    })[0];
    return { sequence: best[0], precision: null };
  }

  // kind === 'spec-decode'
  // Precision is FIXED by the caller — filter to it and bucket by sequence
  // only. variantId = framework|conc. Overlap between method and none buckets.
  const fixedPrecision = sideA.precision;
  const seenMethod = new Map<string, Set<string>>();
  const seenNone = new Map<string, Set<string>>();
  for (const row of hwRows) {
    if (row.isl === null || row.osl === null) continue;
    if (fixedPrecision !== undefined && row.precision !== fixedPrecision) continue;
    const seq = islOslToSequence(row.isl, row.osl);
    if (!seq) continue;
    const variantId = `${row.framework}|${row.conc}`;
    if (row.spec_method === sideA.specMethod) {
      if (!seenMethod.has(seq)) seenMethod.set(seq, new Set());
      seenMethod.get(seq)!.add(variantId);
    }
    if (row.spec_method === sideB.specMethod) {
      if (!seenNone.has(seq)) seenNone.set(seq, new Set());
      seenNone.get(seq)!.add(variantId);
    }
  }
  const tally = new Map<string, { both: number; either: number }>();
  for (const key of new Set([...seenMethod.keys(), ...seenNone.keys()])) {
    const aSet = seenMethod.get(key) ?? new Set<string>();
    const bSet = seenNone.get(key) ?? new Set<string>();
    let both = 0;
    for (const v of aSet) if (bSet.has(v)) both++;
    tally.set(key, { both, either: aSet.size + bSet.size });
  }
  if (tally.size === 0) return { sequence: null, precision: null };
  const best = [...tally.entries()].toSorted((left, right) => {
    if (left[1].both !== right[1].both) return right[1].both - left[1].both;
    return right[1].either - left[1].either;
  })[0];
  return { sequence: best[0], precision: sideA.precision ?? null };
}

// ---------------------------------------------------------------------------
// computeVariantCompareTableData
// ---------------------------------------------------------------------------

export function computeVariantCompareTableData(
  rows: BenchmarkRow[],
  hw: string,
  sequence: string | null,
  sideA: VariantCompareSide,
  sideB: VariantCompareSide,
): {
  defaultTargets: number[];
  ssrRows: SsrInterpolatedRow[];
  interactivityRange: { min: number; max: number };
} {
  const empty = { defaultTargets: [], ssrRows: [], interactivityRange: { min: 0, max: 100 } };
  if (!sequence) return empty;

  const islOsl = sequenceToIslOsl(sequence);
  if (!islOsl) return empty;

  const pointsA = buildSidePoints(rows, hw, islOsl.isl, islOsl.osl, sideA);
  const pointsB = buildSidePoints(rows, hw, islOsl.isl, islOsl.osl, sideB);

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
// computeVariantCompareImageRows
// ---------------------------------------------------------------------------

export function computeVariantCompareImageRows(
  rows: BenchmarkRow[],
  hw: string,
  sequence: string | null,
  sideA: VariantCompareSide,
  sideB: VariantCompareSide,
  interactivityRange: { min: number; max: number },
  includeTargets: number[] = [],
): SsrInterpolatedRow[] {
  if (!sequence || interactivityRange.max <= interactivityRange.min) return [];

  const islOsl = sequenceToIslOsl(sequence);
  if (!islOsl) return [];

  const pointsA = buildSidePoints(rows, hw, islOsl.isl, islOsl.osl, sideA);
  const pointsB = buildSidePoints(rows, hw, islOsl.isl, islOsl.osl, sideB);
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
// summarizeVariantSide / dateRangeForVariantPair
// ---------------------------------------------------------------------------

export function summarizeVariantSide(
  rows: BenchmarkRow[],
  hw: string,
  side: VariantCompareSide,
): PairSummary {
  const filtered = rows.filter((r) => {
    if (r.hardware !== hw) return false;
    // No concrete precision matches nothing — keeps the JSON-LD summary
    // consistent with buildSidePoints/the rendered table (both empty).
    if (side.precision === null || side.precision === undefined) return false;
    if (r.precision !== side.precision) return false;
    if (side.specMethod !== undefined && r.spec_method !== side.specMethod) return false;
    return true;
  });
  let bestThroughput: number | null = null;
  let bestTtft: number | null = null;
  let bestTpot: number | null = null;
  for (const row of filtered) {
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
    configCount: filtered.length,
    bestThroughputPerGpu: bestThroughput,
    bestMedianTtft: bestTtft,
    bestMedianTpot: bestTpot,
  };
}

export function dateRangeForVariantPair(
  rows: BenchmarkRow[],
  hw: string,
  sideA: VariantCompareSide,
  sideB: VariantCompareSide,
): { oldest?: string; newest?: string } {
  let oldest: string | undefined;
  let newest: string | undefined;
  for (const row of rows) {
    if (row.hardware !== hw) continue;
    if (!row.date) continue;
    // Must match at least one side
    const matchA =
      (sideA.precision === undefined || row.precision === sideA.precision) &&
      (sideA.specMethod === undefined || row.spec_method === sideA.specMethod);
    const matchB =
      (sideB.precision === undefined || row.precision === sideB.precision) &&
      (sideB.specMethod === undefined || row.spec_method === sideB.specMethod);
    if (!matchA && !matchB) continue;
    if (oldest === undefined || row.date < oldest) oldest = row.date;
    if (newest === undefined || row.date > newest) newest = row.date;
  }
  return { oldest, newest };
}

// ---------------------------------------------------------------------------
// Narrative templates — precision comparison
// ---------------------------------------------------------------------------

export interface VariantBoth {
  modelLabel: string;
  gpuLabel: string;
  aLabel: string;
  bLabel: string;
  cheaper: string;
  faster: string;
  costRatio: number | null;
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

function variantFullSummary(i: VariantBoth): string {
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

// Precision-specific "both sides" templates — mention quantization tradeoff.
const PRECISION_BOTH_TEMPLATES: ((i: VariantBoth) => string)[] = [
  (i) =>
    `At ${i.target} tok/s/user on ${i.modelLabel} (${i.gpuLabel}), ${i.aLabel} delivers ${i.aValue.toFixed(0)} tok/s/GPU at ${fmtCost(i.aCost)} per million tokens; ${i.bLabel} delivers ${i.bValue.toFixed(0)} tok/s/GPU at ${fmtCost(i.bCost)}. ${variantFullSummary(i)}. Lower-precision quantization trades model accuracy for throughput — check the evaluation page for quality impact.`,
  (i) =>
    `${i.aLabel} posts ${i.aValue.toFixed(0)} tok/s/GPU for ${fmtCost(i.aCost)} per million tokens at ${i.target} tok/s/user on ${i.modelLabel} (${i.gpuLabel}); ${i.bLabel} posts ${i.bValue.toFixed(0)} tok/s/GPU for ${fmtCost(i.bCost)}. ${variantFullSummary(i)}. Quantization-level accuracy differences are tracked on the evaluation tab.`,
  (i) =>
    `Throughput at ${i.target} tok/s/user on ${i.modelLabel} (${i.gpuLabel}): ${i.aLabel} hits ${i.aValue.toFixed(0)} tok/s/GPU, ${i.bLabel} hits ${i.bValue.toFixed(0)}. Per-million costs land at ${fmtCost(i.aCost)} and ${fmtCost(i.bCost)} respectively. ${variantFullSummary(i)}. The cost-throughput tradeoff from lower precision is only part of the picture — see the evaluation page for accuracy data.`,
  (i) =>
    `${BAND_PHRASE[i.band].charAt(0).toUpperCase() + BAND_PHRASE[i.band].slice(1)} of the ${i.range} interactivity band, at ${i.target} tok/s/user on ${i.modelLabel} (${i.gpuLabel}): ${i.aLabel} runs ${i.aValue.toFixed(0)} tok/s/GPU at ${fmtCost(i.aCost)}/M tokens, ${i.bLabel} runs ${i.bValue.toFixed(0)} at ${fmtCost(i.bCost)}/M. ${variantFullSummary(i)}. Precision changes affect both inference speed and model quality — consult the evaluation tab for accuracy benchmarks.`,
];

// Spec-decode-specific "both sides" templates — mention speculative decoding.
const SPEC_DECODE_BOTH_TEMPLATES: ((i: VariantBoth) => string)[] = [
  (i) =>
    `At ${i.target} tok/s/user on ${i.modelLabel} (${i.gpuLabel}), ${i.aLabel} delivers ${i.aValue.toFixed(0)} tok/s/GPU at ${fmtCost(i.aCost)} per million tokens; ${i.bLabel} delivers ${i.bValue.toFixed(0)} tok/s/GPU at ${fmtCost(i.bCost)}. ${variantFullSummary(i)}. Speculative decoding accepts draft tokens to reduce per-token latency — gains vary by workload and prompt distribution.`,
  (i) =>
    `${i.aLabel} posts ${i.aValue.toFixed(0)} tok/s/GPU for ${fmtCost(i.aCost)} per million tokens at ${i.target} tok/s/user on ${i.modelLabel} (${i.gpuLabel}); ${i.bLabel} posts ${i.bValue.toFixed(0)} tok/s/GPU for ${fmtCost(i.bCost)}. ${variantFullSummary(i)}. Draft-token acceptance rates determine whether speculative decoding helps or hurts at a given concurrency level.`,
  (i) =>
    `Throughput at ${i.target} tok/s/user on ${i.modelLabel} (${i.gpuLabel}): ${i.aLabel} hits ${i.aValue.toFixed(0)} tok/s/GPU, ${i.bLabel} hits ${i.bValue.toFixed(0)}. Per-million costs land at ${fmtCost(i.aCost)} and ${fmtCost(i.bCost)} respectively. ${variantFullSummary(i)}. Speculative decoding trades extra compute on draft tokens for fewer decoding steps — the payoff depends on sequence length and batch size.`,
  (i) =>
    `${BAND_PHRASE[i.band].charAt(0).toUpperCase() + BAND_PHRASE[i.band].slice(1)} of the ${i.range} interactivity band, at ${i.target} tok/s/user on ${i.modelLabel} (${i.gpuLabel}): ${i.aLabel} runs ${i.aValue.toFixed(0)} tok/s/GPU at ${fmtCost(i.aCost)}/M tokens, ${i.bLabel} runs ${i.bValue.toFixed(0)} at ${fmtCost(i.bCost)}/M. ${variantFullSummary(i)}. Gains from speculative decoding vary by workload; short-output prompts tend to benefit less.`,
];

// Single-side templates (shared by both kinds).
const VARIANT_SINGLE_TEMPLATES: ((args: {
  modelLabel: string;
  gpuLabel: string;
  presentLabel: string;
  missingLabel: string;
  target: number;
  presentValue: number;
  presentCost: number;
}) => string)[] = [
  (i) =>
    `At ${i.target} tok/s/user on ${i.modelLabel} (${i.gpuLabel}), ${i.presentLabel} delivers ${i.presentValue.toFixed(0)} tok/s/GPU at ${fmtCost(i.presentCost)} per million tokens; ${i.missingLabel} hasn't been benchmarked at this target.`,
  (i) =>
    `${i.presentLabel} hits ${i.presentValue.toFixed(0)} tok/s/GPU for ${fmtCost(i.presentCost)} per million tokens at ${i.target} tok/s/user on ${i.modelLabel} (${i.gpuLabel}). No ${i.missingLabel} data at this operating point.`,
  (i) =>
    `${i.presentLabel}: ${i.presentValue.toFixed(0)} tok/s/GPU, ${fmtCost(i.presentCost)} per million tokens at ${i.target} tok/s/user on ${i.modelLabel} (${i.gpuLabel}). ${i.missingLabel} is unmeasured here.`,
];

// ---------------------------------------------------------------------------
// variantCompareNarrative
// ---------------------------------------------------------------------------

export function variantCompareNarrative(
  kind: VariantCompareKind,
  modelLabel: string,
  gpuLabel: string,
  aLabel: string,
  bLabel: string,
  ssrRows: SsrInterpolatedRow[],
  interactivityRange: { min: number; max: number },
): string[] {
  if (ssrRows.length === 0) return [];

  const range = `${interactivityRange.min}–${interactivityRange.max} tok/s/user`;
  const pageSeed = `${kind}|${modelLabel}|${gpuLabel}|${aLabel}|${bLabel}`;
  const paragraphs: string[] = [];
  const bothPool = kind === 'precision' ? PRECISION_BOTH_TEMPLATES : SPEC_DECODE_BOTH_TEMPLATES;

  for (const [rowIndex, row] of ssrRows.entries()) {
    const { target, a, b } = row;
    if (!a && !b) continue;
    const band = bandFor(target, interactivityRange);

    if (a && b) {
      const costOk = a.cost > 0 && b.cost > 0;
      const tputOk = a.value > 0 && b.value > 0;
      const aCheaper = a.cost < b.cost;
      const aFaster = a.value > b.value;
      const costRatio = costOk ? (aCheaper ? b.cost / a.cost : a.cost / b.cost) : null;
      const tputRatio = tputOk ? (aFaster ? a.value / b.value : b.value / a.value) : null;
      const inputs: VariantBoth = {
        modelLabel,
        gpuLabel,
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
      paragraphs.push(pickRotated(bothPool, pageSeed, rowIndex)(inputs));
      continue;
    }

    const present = (a ?? b)!;
    paragraphs.push(
      pickRotated(
        VARIANT_SINGLE_TEMPLATES,
        pageSeed,
        rowIndex,
      )({
        modelLabel,
        gpuLabel,
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
// JSON-LD helpers
// ---------------------------------------------------------------------------

export function variantJsonLdEntryFor(label: string, summary: PairSummary, position: number) {
  const props: { name: string; value: string | number }[] = [
    { name: 'Category', value: 'Configuration Variant' },
  ];
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

export function buildVariantJsonLd(
  kind: VariantCompareKind,
  model: CompareModelSlug,
  gpuKey: string,
  aLabel: string,
  bLabel: string,
  url: string,
  summaryA: PairSummary,
  summaryB: PairSummary,
  ssrRows: SsrInterpolatedRow[],
  imageUrl?: string,
  datePublished?: string,
  dateModified?: string,
) {
  const gpuMeta = HW_REGISTRY[gpuKey];
  const gpuDisplayLabel = gpuMeta?.label ?? gpuKey.toUpperCase();
  const kindLabel =
    kind === 'precision' ? 'Precision comparison' : 'Speculative decoding comparison';

  const itemListName = `${model.label} ${kindLabel} — ${aLabel} vs ${bLabel} on ${gpuDisplayLabel}`;
  const itemListDescription =
    kind === 'precision'
      ? `Precision comparison of ${aLabel} versus ${bLabel} for ${model.label} inference on ${gpuDisplayLabel}. Throughput, cost, and interactivity at matched operating points.`
      : `Speculative decoding comparison of ${aLabel} versus ${bLabel} for ${model.label} inference on ${gpuDisplayLabel}. Throughput, cost, and interactivity at matched operating points.`;
  const datasetName = `${aLabel} vs ${bLabel} (${model.label}, ${gpuDisplayLabel}) ${kindLabel}`;
  const datasetDescription =
    kind === 'precision'
      ? `Interpolated throughput and cost for ${aLabel} versus ${bLabel} precision on ${model.label} (${gpuDisplayLabel}) at matched interactivity levels.`
      : `Interpolated throughput and cost for ${aLabel} versus ${bLabel} speculative decoding on ${model.label} (${gpuDisplayLabel}) at matched interactivity levels.`;

  const comparisonRows = ssrRows
    .filter((row) => row.a || row.b)
    .map((row) => {
      const metrics: { name: string; value: string }[] = [
        { name: 'Model', value: model.displayName },
        { name: 'GPU', value: gpuDisplayLabel },
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
        name: `${model.label} ${kind === 'precision' ? 'precision' : 'spec-decode'} comparison at ${row.target} tok/s/user interactivity`,
        variableMeasured: metrics.map((m) => ({
          '@type': 'PropertyValue',
          name: m.name,
          value: m.value,
        })),
      };
    });

  const keywords = [
    ...new Set(
      [
        'AI inference benchmark',
        kind === 'precision' ? 'precision comparison' : 'speculative decoding comparison',
        'inference throughput',
        'tokens per second',
        model.label,
        gpuDisplayLabel,
        aLabel,
        bLabel,
        gpuMeta?.vendor,
      ].filter(Boolean),
    ),
  ].join(', ');

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
        itemListElement: [
          variantJsonLdEntryFor(aLabel, summaryA, 1),
          variantJsonLdEntryFor(bLabel, summaryB, 2),
        ],
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
              keywords,
              ...(datePublished && { datePublished }),
              ...(dateModified && { dateModified }),
              creator: {
                '@type': 'Organization',
                name: AUTHOR_NAME,
                url: AUTHOR_URL,
              },
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

export function buildVariantBreadcrumbJsonLd(
  kind: VariantCompareKind,
  pairLabel: string,
  url: string,
) {
  const routeSegment = kind === 'precision' ? 'compare-precision' : 'compare-spec-decode';
  const indexUrl = `${SITE_URL}/${routeSegment}`;
  const indexName =
    kind === 'precision' ? 'Precision Comparisons' : 'Speculative Decoding Comparisons';
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: indexName, item: indexUrl },
      { '@type': 'ListItem', position: 3, name: pairLabel, item: url },
    ],
  };
}

// Re-export types used by callers
export type { PairSummary, SsrInterpolatedRow } from '@/lib/compare-ssr';
