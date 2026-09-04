/**
 * Pure projection for GET /api/v1/views/compare.
 *
 * All interpolation math lives in `lib/compare-ssr.ts` /
 * `components/calculator/interpolation.ts` (the /compare page pipeline); this
 * module only reshapes those results into the documented public view:
 * per-tier cells without the bulky `nearestPoints` evidence arrays, a signed
 * head-to-head delta per row, and optional precision / spec-decode breakdowns.
 */
import { interpolateForGPU } from '@/components/calculator/interpolation';
import type { InterpolatedResult } from '@/components/calculator/types';
import type { BenchmarkRow } from '@/lib/api';
import {
  buildGpuDataPoints,
  computeCompareImageRows,
  computeCompareStat,
  computeCompareTableData,
  KNOWN_PRECISIONS,
  type CompareStat,
  type SsrInterpolatedRow,
} from '@/lib/compare-ssr';
export const COMPARE_VARIANTS = ['default', 'per-dollar', 'precision', 'spec-decode'] as const;
export type CompareVariant = (typeof COMPARE_VARIANTS)[number];

export interface CompareViewCell {
  /** Base GPU key for this side of the pair, e.g. `b200`. */
  hardware: string;
  /** Serving-config key the interpolation ran on, e.g. `b200_sglang`. */
  configKey: string;
  /** Total tok/s per GPU at the interactivity target. */
  throughputPerGpu: number;
  inputThroughputPerGpu: number;
  outputThroughputPerGpu: number;
  /** Blended $/M total tokens (hourly-cost provider, as on /compare). */
  costPerMtok: number;
  costPerMtokInput: number;
  costPerMtokOutput: number;
  throughputPerMw: number;
  concurrency: number;
  precision: string | null;
  /** True when the tier fell outside the measured range and was clamped. */
  clamped: boolean;
}

export function projectCompareCell(
  result: InterpolatedResult | null,
  hardware: string,
): CompareViewCell | null {
  if (!result) return null;
  return {
    hardware,
    configKey: result.hwKey,
    throughputPerGpu: result.value,
    inputThroughputPerGpu: result.inputTputValue,
    outputThroughputPerGpu: result.outputTputValue,
    costPerMtok: result.cost,
    costPerMtokInput: result.costInput,
    costPerMtokOutput: result.costOutput,
    throughputPerMw: result.tpPerMw,
    concurrency: result.concurrency,
    precision: result.precision ?? null,
    clamped: result.clamped ?? false,
  };
}

export interface CompareViewTableRow {
  /** Interactivity target (median tok/s/user). */
  tier: number;
  a: CompareViewCell | null;
  b: CompareViewCell | null;
  /** What `deltaPct`/`winner` compare: throughput (default) or cost (per-dollar). */
  basis: 'throughputPerGpu' | 'costPerMtok';
  /** Signed % of `a` vs `b` on the basis metric; null unless both sides exist. */
  deltaPct: number | null;
  /** GPU key of the better side on the basis metric (null on ties/missing). */
  winner: string | null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Project SSR rows into the public table. `variant === 'per-dollar'` switches
 * the winner/delta basis from throughput (higher wins) to $/M tokens (lower
 * wins); cells always carry both metrics.
 */
export function buildCompareTable(
  ssrRows: readonly SsrInterpolatedRow[],
  variant: CompareVariant,
  aKey: string,
  bKey: string,
): CompareViewTableRow[] {
  const basis = variant === 'per-dollar' ? ('costPerMtok' as const) : ('throughputPerGpu' as const);
  return ssrRows.map((row) => {
    const a = projectCompareCell(row.a, aKey);
    const b = projectCompareCell(row.b, bKey);
    let deltaPct: number | null = null;
    let winner: string | null = null;
    if (a && b) {
      const [aValue, bValue] =
        basis === 'costPerMtok'
          ? [a.costPerMtok, b.costPerMtok]
          : [a.throughputPerGpu, b.throughputPerGpu];
      if (bValue !== 0) deltaPct = round1(((aValue - bValue) / bValue) * 100);
      if (aValue !== bValue) {
        const aWins = basis === 'costPerMtok' ? aValue < bValue : aValue > bValue;
        winner = aWins ? aKey : bKey;
      }
    } else if (a || b) {
      winner = a ? aKey : bKey;
    }
    return { tier: row.target, a, b, basis, deltaPct, winner };
  });
}

/**
 * Interpolate the pair at caller-chosen interactivity tiers, reusing the
 * /compare OG-image sampler. Tiers outside the measured interactivity range
 * are clamped into it by the sampler; requested tiers whose clamped sample no
 * longer matches (i.e. out-of-range requests) are dropped.
 */
export function compareRowsAtTiers(
  rows: BenchmarkRow[],
  a: string,
  b: string,
  sequence: string,
  precision: string,
  interactivityRange: { min: number; max: number },
  tiers: readonly number[],
): SsrInterpolatedRow[] {
  const sampled = computeCompareImageRows(rows, a, b, sequence, precision, interactivityRange, [
    ...tiers,
  ]);
  const wanted = new Set(tiers);
  return sampled.filter((row) => wanted.has(row.target));
}

export interface CompareHeadToHead {
  faster: string;
  slower: string;
  /** How much faster the faster GPU is, % (median across shared tiers).
   *  `faster`/`cheaper` carry display labels (e.g. `B200`), as on the page. */
  tputPct: number;
  cheaper: string;
  pricier: string;
  /** How much cheaper the cheaper GPU is, % (median across shared tiers). */
  costPct: number;
}

export function projectCompareStat(stat: CompareStat | null): CompareHeadToHead | null {
  if (!stat) return null;
  return {
    faster: stat.faster,
    slower: stat.slower,
    tputPct: stat.tputPct,
    cheaper: stat.cheaper,
    pricier: stat.pricier,
    costPct: stat.costPct,
  };
}

export interface PrecisionBreakdownEntry {
  precision: string;
  tiers: number[];
  headToHead: CompareHeadToHead | null;
}

/** variant=precision: re-run the page table per known precision with pair data. */
export function buildPrecisionBreakdown(
  rows: BenchmarkRow[],
  a: string,
  b: string,
  sequence: string,
): PrecisionBreakdownEntry[] {
  const entries: PrecisionBreakdownEntry[] = [];
  for (const precision of KNOWN_PRECISIONS) {
    const { defaultTargets, ssrRows } = computeCompareTableData(rows, a, b, sequence, precision);
    if (ssrRows.length === 0) continue;
    entries.push({
      precision,
      tiers: defaultTargets,
      headToHead: projectCompareStat(computeCompareStat(a, b, ssrRows)),
    });
  }
  return entries;
}

export interface SpecDecodeBreakdownEntry {
  specMethod: string;
  /** Interactivity tier the cells are read at (middle default target). */
  tier: number;
  a: CompareViewCell | null;
  b: CompareViewCell | null;
}

/**
 * variant=spec-decode: split the pair by speculative-decoding method at one
 * representative tier. Fixed-sequence scenarios only (agentic traces mix
 * sequence shapes, so per-method splits are not comparable there).
 */
export function buildSpecDecodeBreakdown(
  rows: BenchmarkRow[],
  a: string,
  b: string,
  isl: number,
  osl: number,
  precision: string,
  tiers: readonly number[],
): SpecDecodeBreakdownEntry[] {
  if (tiers.length === 0) return [];
  const tier = tiers[Math.floor((tiers.length - 1) / 2)];
  const methods = [
    ...new Set(
      rows
        .filter(
          (row) =>
            (row.hardware === a || row.hardware === b) &&
            row.isl === isl &&
            row.osl === osl &&
            row.precision === precision,
        )
        .map((row) => row.spec_method)
        .filter((method): method is string => typeof method === 'string'),
    ),
  ].toSorted();
  return methods.map((specMethod) => {
    const pointsA = buildGpuDataPoints(rows, a, isl, osl, precision, specMethod);
    const pointsB = buildGpuDataPoints(rows, b, isl, osl, precision, specMethod);
    return {
      specMethod,
      tier,
      a: projectCompareCell(
        pointsA.length > 0
          ? interpolateForGPU(pointsA, tier, 'interactivity_to_throughput', 'costh')
          : null,
        a,
      ),
      b: projectCompareCell(
        pointsB.length > 0
          ? interpolateForGPU(pointsB, tier, 'interactivity_to_throughput', 'costh')
          : null,
        b,
      ),
    };
  });
}

/** Flat CSV projection: one row per tier with a_/b_ prefixed cells. */
export function compareViewCsvRows(
  table: readonly CompareViewTableRow[],
  model: string,
  a: string,
  b: string,
  scenario: string | null,
): Record<string, unknown>[] {
  return table.map((row) => ({
    model,
    scenario,
    tier: row.tier,
    basis: row.basis,
    delta_pct: row.deltaPct,
    winner: row.winner,
    a_hardware: a,
    a_throughput_per_gpu: row.a?.throughputPerGpu ?? null,
    a_cost_per_mtok: row.a?.costPerMtok ?? null,
    a_concurrency: row.a?.concurrency ?? null,
    a_clamped: row.a?.clamped ?? null,
    b_hardware: b,
    b_throughput_per_gpu: row.b?.throughputPerGpu ?? null,
    b_cost_per_mtok: row.b?.costPerMtok ?? null,
    b_concurrency: row.b?.concurrency ?? null,
    b_clamped: row.b?.clamped ?? null,
  }));
}
