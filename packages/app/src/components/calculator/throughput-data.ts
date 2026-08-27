/**
 * Pure row → `GPUDataPoint` assembly for the throughput calculator — no React,
 * no 'use client'.
 *
 * Extracted verbatim from `useThroughputData.ts` so server-side consumers (the
 * public views API) share the exact grouping/derivation logic the dashboard
 * renders, instead of re-implementing it. The hook re-exports everything here,
 * so existing client imports keep working unchanged.
 */

import { rowToSequence } from '@semianalysisai/inferencex-constants';

import type { AggDataEntry, HardwareConfig } from '@/components/inference/types';
import type { BenchmarkRow } from '@/lib/api';
import { rowToAggDataEntry } from '@/lib/benchmark-transform';
import { getHardwareKey } from '@/lib/chart-utils';
import { getHardwareConfig, getGpuSpecs } from '@/lib/constants';
import { countCurvesByPrecision, resolveEffectivePrecisions } from '@/lib/default-precisions';
import { Percentile, Sequence } from '@/lib/data-mappings';
import { supportsTokenMetric } from '@/lib/supplemental-benchmarks';

import type { CostType, GPUDataPoint, InterpolatedResult } from './types';

/** Cost per million tokens: costPerHour / (tokPerSec * 3600 / 1_000_000) */
const computeGpuCost = (costPerHour: number, tps: number) =>
  costPerHour && tps > 0 ? costPerHour / ((tps * 3600) / 1_000_000) : 0;

/** Metadata describing what a group key stands for. */
export interface GroupMeta {
  hwKey: string;
  /** Set only when multiple precisions are selected, matching the group key. */
  precision?: string;
}

/** Group metadata for an unofficial-run overlay group. */
export interface OverlayGroupMeta extends GroupMeta {
  /** Index of the run in the loaded set — drives the overlay palette color. */
  runIndex: number;
}

function getAgenticMetric(
  entry: AggDataEntry,
  percentile: Percentile,
  suffix: 'intvty' | 'e2el',
): number {
  const value = entry[`${percentile}_${suffix}` as keyof AggDataEntry];
  return typeof value === 'number' ? value : 0;
}

/**
 * Fraction of a row's input tokens served from cache, or null when the row
 * carries no cache metric at all — which is every fixed-sequence row.
 *
 * Three tiers are reported and they do not all stack. Measured across 326
 * production agentic rows, checked against each row's own
 * `theoretical_cache_hit_rate` ceiling:
 *
 * - **GPU + external are disjoint.** Their sum never exceeds 1 nor the ceiling
 *   on any row carrying both, so they add.
 * - **The CPU-offload tier double-counts external where both are reported.**
 *   `gpu + external + cpu` breaches the ceiling on 56 of the 132 rows with a
 *   non-zero CPU rate, and *every* breach is a row that also reports an
 *   external rate — the router-side external figure already contains the
 *   offload tier there.
 * - **Where no external rate is reported, the CPU tier is real and disjoint.**
 *   On the 26 offload-on rows with no external figure, `gpu + cpu` breaches the
 *   ceiling 0 times, median CPU rate 0.055.
 *
 * Hence the conditional: external when present, CPU only in its absence. Adding
 * CPU unconditionally would overstate the cached share; dropping it entirely —
 * which this did before — understated it by a median 5.54pp on those 26 rows,
 * and an understated cached share bills more input at the fresh-token price and
 * so *overstates* revenue (by a median 27% on the input leg there). That is the
 * direction worth spending a branch to avoid.
 *
 * A reported external `0` suppresses CPU rather than counting as an absence: a
 * router reporting no external hits has still accounted for the offload tier. No
 * production row currently has that shape, so that arm is a deliberate choice
 * about unobserved data, pinned by a test rather than measured.
 *
 * The clamp is not decorative — the GPU figure alone reaches 1.185 on some rows.
 */
function cacheHitRateOf(m: Record<string, number>): number | null {
  const gpu = m.server_gpu_cache_hit_rate;
  const external = m.server_external_cache_hit_rate;
  const cpu = m.server_cpu_cache_hit_rate;
  const hasExternal = typeof external === 'number';
  // Only the tier that is not already counted by `external` is added.
  const secondary = hasExternal ? external : typeof cpu === 'number' ? cpu : undefined;
  if (typeof gpu !== 'number' && secondary === undefined) return null;
  const sum = (typeof gpu === 'number' ? gpu : 0) + (secondary ?? 0);
  return Math.max(0, Math.min(1, sum));
}

/**
 * Fraction of a config's tokens that are input tokens.
 *
 * The obvious formula — `input / (input + output)` off the per-GPU rates — is
 * wrong for disaggregated runs, and wrong by a lot. Those rows report
 * `input_tput_per_gpu` per *prefill* chip and `output_tput_per_gpu` per *decode*
 * chip, while `tput_per_gpu` is per chip overall. Across production history the
 * two rates sum to between 1.0x and 16.1x the total, exactly tracking
 * `(prefill + decode) x (isl/prefill + osl/decode) / (isl + osl)`. Aggregated
 * rows sum to 1.0000x on all 937 of them.
 *
 * So: trust the measured rates when they are self-consistent, and fall back to
 * the structural mix when they are not. For a fixed sequence the structural mix
 * is exactly ISL:OSL — every request has that shape, so no config can change it.
 * For agentic traces it is the run's own prompt:generation token counts.
 *
 * Returns null when nothing in the row pins the mix down.
 */
function inputTokenShare(row: BenchmarkRow, inputTput: number, outputTput: number): number | null {
  const tput = row.metrics.tput_per_gpu ?? 0;
  const sum = inputTput + outputTput;
  // Self-consistent: the rates share the denominator `tput_per_gpu` uses, so the
  // split they imply is the measured one. 1% covers float noise, not a
  // prefill/decode mismatch (the smallest of those in production is 1.63x).
  if (tput > 0 && sum > 0 && Math.abs(sum / tput - 1) <= 0.01) return inputTput / sum;

  const { isl, osl } = row;
  if (typeof isl === 'number' && typeof osl === 'number' && isl + osl > 0) {
    return isl / (isl + osl);
  }
  const prompt = row.metrics.total_prompt_tokens;
  const generated = row.metrics.total_generation_tokens;
  if (typeof prompt === 'number' && typeof generated === 'number' && prompt + generated > 0) {
    return prompt / (prompt + generated);
  }
  // The remaining rates are known to be on incompatible denominators. Treat
  // the mix as unknown rather than turning a per-prefill/per-decode ratio into
  // a fleet-wide token share and billing input volume the fleet did not serve.
  return null;
}

/**
 * Build `GPUDataPoint` groups from raw benchmark rows.
 *
 * Shared by the official and the unofficial-run overlay paths so both are
 * derived by identical logic — the only difference is how rows are keyed into
 * groups, which the caller controls via `classify`.
 */
export function buildGpuGroups<M extends GroupMeta>(
  rows: BenchmarkRow[],
  options: {
    sequence: Sequence;
    precisions: string[];
    /** Agentic x/e2e latency percentile. Fixed-sequence rows keep the median. */
    percentile?: Percentile;
    /** Token basis selected by the consumer; applies to official and overlay rows. */
    tokenType?: CostType;
    /** Derive a row's group key + metadata. Return null to drop the row. */
    classify: (hwKey: string, row: BenchmarkRow) => { key: string; meta: M } | null;
  },
): {
  grouped: Record<string, GPUDataPoint[]>;
  groupMeta: Record<string, M>;
  hwConfigMap: HardwareConfig;
} {
  const {
    sequence,
    precisions,
    percentile = Percentile.P90,
    tokenType = 'total',
    classify,
  } = options;
  const grouped: Record<string, GPUDataPoint[]> = {};
  const groupMeta: Record<string, M> = {};
  const hwConfigMap: HardwareConfig = {};

  for (const row of rows) {
    if (rowToSequence(row) !== sequence) continue;
    if (!precisions.includes(row.precision)) continue;
    if (!supportsTokenMetric(row, tokenType)) continue;

    const entry = rowToAggDataEntry(row);
    const hwKey = getHardwareKey(entry);
    const hwConfig = getHardwareConfig(hwKey, entry.model);
    if (!hwConfig) continue;

    const classified = classify(hwKey, row);
    if (!classified) continue;
    const { key: groupKey, meta } = classified;

    if (!hwConfigMap[hwKey]) hwConfigMap[hwKey] = { ...hwConfig, name: hwKey };

    const m = row.metrics;
    const tput = m.tput_per_gpu ?? 0;
    const outputTput = m.output_tput_per_gpu ?? tput;
    const inputTput = m.input_tput_per_gpu ?? 0;
    const cacheHitRate = cacheHitRateOf(m);
    const tokenShare = inputTokenShare(row, inputTput, outputTput);
    const specs = getGpuSpecs(hwKey);
    const power = specs.power;

    if (!grouped[groupKey]) grouped[groupKey] = [];
    groupMeta[groupKey] = meta;

    grouped[groupKey].push({
      hwKey,
      interactivity:
        sequence === Sequence.AgenticTraces
          ? getAgenticMetric(entry, percentile, 'intvty')
          : entry.median_intvty,
      ...(sequence === Sequence.AgenticTraces
        ? {
            e2eLatency: getAgenticMetric(entry, percentile, 'e2el'),
            date: row.date,
          }
        : {}),
      throughput: tput,
      outputThroughput: outputTput,
      inputThroughput: inputTput,
      ...(cacheHitRate === null ? {} : { cacheHitRate }),
      ...(tokenShare === null ? {} : { inputTokenShare: tokenShare }),
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

  return { grouped, groupMeta, hwConfigMap };
}

/**
 * Interpolated throughput on the selected token basis.
 *
 * Field pick (not math) mirroring `getThroughputForType` in
 * `ThroughputBarChart.tsx` — that module is a 'use client' d3 component, so the
 * server-side views API reads the same fields through this pure twin instead of
 * importing it. If the client accessor ever gains logic, move it here and have
 * the chart import this one.
 */
export function throughputForType(result: InterpolatedResult, costType: CostType): number {
  if (costType === 'input') return result.inputTputValue;
  if (costType === 'output') return result.outputTputValue;
  return result.value;
}

/**
 * Server-side mirror of the dashboard's precision resolution
 * (`GlobalFilterContext`): explicit selections are honoured intersected with
 * what the rows actually carry; otherwise the densest precision is auto-picked
 * via `resolveEffectivePrecisions`. Composes the same pure functions the
 * dashboard uses — `countCurvesByPrecision` + `resolveEffectivePrecisions` —
 * over the fetched rows, with the same `['fp4']` fallback when the model has no
 * rows for the sequence.
 */
export function resolveRowPrecisions(
  rows: BenchmarkRow[],
  sequence: Sequence,
  requested: readonly string[],
): string[] {
  const forSequence = rows.filter((row) => rowToSequence(row) === sequence);
  const available = [...new Set(forSequence.map((row) => row.precision))].toSorted();
  return resolveEffectivePrecisions({
    selectedPrecisions: [...requested],
    availablePrecisions: available.length > 0 ? available : ['fp4'],
    curveCounts: countCurvesByPrecision(forSequence),
    explicit: requested.length > 0,
  });
}
