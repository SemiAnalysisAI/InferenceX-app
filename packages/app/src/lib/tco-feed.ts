/**
 * TCO feed — per-hardware Pareto-frontier throughput reads at fixed
 * interactivity tiers, consumed by external spreadsheet TCO models
 * (Excel / Power Query) via /api/v1/tco-feed. The scores view
 * (computeTcoScores) folds those per-tier reads into a single tier-weighted,
 * workload-blended, output-equivalent number per chip.
 *
 * Reuses the calculator's frontier + monotone-spline code (interpolation.ts)
 * so every number matches what the dashboard chart renders at the same
 * interactivity. Boundary semantics deliberately differ from the chart,
 * which refuses to read outside the frontier on both sides:
 *
 * - tier BELOW the frontier's min interactivity → the min-knot's throughput
 *   (`clamped_low`). The low end of a sweep is a coverage artifact — the
 *   chip can serve at least that much when batched deeper — so a null here
 *   would understate chips whose concurrency sweep stopped early.
 * - tier ABOVE the frontier's max interactivity → 0 (`unreachable`). The
 *   high end is a genuine capability limit: the chip cannot serve that SLA,
 *   and 0 is the honest "can't serve this segment" for a weighted-average
 *   consumer (a blank cell would silently become a stale pasted number).
 */

import {
  hermiteInterpolate,
  monotoneSlopes,
  paretoFrontUpperLeft,
} from '@/components/calculator/interpolation';

/** Minimal structural slice of a BenchmarkRow the feed computation reads. */
export interface TcoFeedSourceRow {
  hardware: string;
  /** Absent on rows predating the column — treated as single_turn. */
  benchmark_type?: string | null;
  isl: number | null;
  osl: number | null;
  metrics: Record<string, number>;
  date: string;
}

export interface TcoFeedWorkload {
  isl: number;
  osl: number;
}

export type TcoTierBoundary = 'interpolated' | 'clamped_low' | 'unreachable';

export interface TcoFeedRow {
  hardware: string;
  /** `<isl>x<osl>`, e.g. `8192x1024`. */
  workload: string;
  /** Interactivity read point (tok/s/user). */
  tier: number;
  /** Output tokens/s per GPU on the frontier at `tier`; 0 when unreachable. */
  output_tput_per_gpu: number;
  boundary: TcoTierBoundary;
  /** Number of Pareto-frontier knots backing this hardware × workload. */
  frontier_points: number;
  frontier_min_interactivity: number;
  frontier_max_interactivity: number;
  /** Newest benchmark date among the frontier knots (freshness). */
  latest_date: string;
  /** Oldest benchmark date among the frontier knots (staleness flag). */
  oldest_frontier_date: string;
}

export const DEFAULT_TIERS: readonly number[] = [30, 50, 75, 100];
export const DEFAULT_WORKLOADS: readonly TcoFeedWorkload[] = [
  { isl: 1024, osl: 1024 },
  { isl: 8192, osl: 1024 },
];
/**
 * Traffic-mix weights for DEFAULT_TIERS: most tokens are served in the
 * 30–75 tok/s/user band; 100+ is a premium sliver. Only used when the
 * request keeps the default tiers — custom tiers default to equal weights.
 */
export const DEFAULT_TIER_WEIGHTS: readonly number[] = [0.35, 0.4, 0.2, 0.05];
/**
 * Default input-token value ratio for the output-equivalent conversion
 * `out × (1 + α × ISL/OSL)` — prefill work is worth ~25% of decode work
 * per token, consistent with prevailing API input:output pricing.
 */
export const DEFAULT_ALPHA = 0.25;

const MAX_TIERS = 20;
const MAX_TIER_VALUE = 10_000;
const MAX_WORKLOADS = 8;
const MAX_ALPHA = 10;

/**
 * Parse `tiers=30,50,75,100`. Absent/blank → defaults; any invalid or
 * duplicate entry → null (caller responds 400 — duplicates would
 * double-count in the scores view).
 */
export function parseTiers(raw: string | null): number[] | null {
  if (raw === null || raw.trim() === '') return [...DEFAULT_TIERS];
  const parts = raw.split(',').map((s) => s.trim());
  if (parts.length > MAX_TIERS) return null;
  const tiers: number[] = [];
  for (const part of parts) {
    const value = Number(part);
    if (part === '' || !Number.isFinite(value) || value <= 0 || value > MAX_TIER_VALUE) {
      return null;
    }
    if (tiers.includes(value)) return null;
    tiers.push(value);
  }
  return tiers;
}

/**
 * Parse `workloads=1024x1024,8192x1024` (lowercase `x` separator).
 * Absent/blank → defaults; any invalid or duplicate entry → null (caller
 * responds 400 — duplicates would double-count in the scores view).
 */
export function parseWorkloads(raw: string | null): TcoFeedWorkload[] | null {
  if (raw === null || raw.trim() === '') return [...DEFAULT_WORKLOADS];
  const parts = raw.split(',').map((s) => s.trim());
  if (parts.length > MAX_WORKLOADS) return null;
  const workloads: TcoFeedWorkload[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const match = /^(?<isl>\d{1,7})x(?<osl>\d{1,7})$/u.exec(part);
    if (!match?.groups) return null;
    const isl = Number(match.groups.isl);
    const osl = Number(match.groups.osl);
    if (isl <= 0 || osl <= 0) return null;
    const key = `${isl}x${osl}`;
    if (seen.has(key)) return null;
    seen.add(key);
    workloads.push({ isl, osl });
  }
  return workloads;
}

/**
 * Parse a comma-separated non-negative weight list of exactly `expected`
 * entries, normalized to sum to 1. Any invalid entry or a zero sum → null.
 */
function parseWeightList(raw: string, expected: number): number[] | null {
  const parts = raw.split(',').map((s) => s.trim());
  if (parts.length !== expected) return null;
  const weights: number[] = [];
  for (const part of parts) {
    const value = Number(part);
    if (part === '' || !Number.isFinite(value) || value < 0) return null;
    weights.push(value);
  }
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return null;
  return weights.map((w) => w / sum);
}

/**
 * Parse `weights=0.35,0.4,0.2,0.05` (one per tier, normalized to sum 1).
 * Absent/blank → DEFAULT_TIER_WEIGHTS when the tiers are exactly
 * DEFAULT_TIERS, equal weights otherwise; invalid → null (caller 400s).
 */
export function parseTierWeights(raw: string | null, tiers: readonly number[]): number[] | null {
  if (raw === null || raw.trim() === '') {
    const isDefaultTiers =
      tiers.length === DEFAULT_TIERS.length && tiers.every((t, i) => t === DEFAULT_TIERS[i]);
    if (isDefaultTiers) return [...DEFAULT_TIER_WEIGHTS];
    return tiers.map(() => 1 / tiers.length);
  }
  return parseWeightList(raw, tiers.length);
}

/**
 * Parse `workload_weights=0.5,0.5` (one per workload, normalized to sum 1).
 * Absent/blank → equal split; invalid → null (caller 400s).
 */
export function parseWorkloadWeights(
  raw: string | null,
  workloads: readonly TcoFeedWorkload[],
): number[] | null {
  if (raw === null || raw.trim() === '') return workloads.map(() => 1 / workloads.length);
  return parseWeightList(raw, workloads.length);
}

/**
 * Parse `alpha=0.25` — the input-token value ratio in the score view's
 * output-equivalent conversion. Absent/blank → DEFAULT_ALPHA; invalid
 * (non-finite, negative, > 10) → null (caller 400s).
 */
export function parseAlpha(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return DEFAULT_ALPHA;
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value < 0 || value > MAX_ALPHA) return null;
  return value;
}

interface FrontierPoint {
  interactivity: number;
  throughput: number;
  date: string;
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * Compute the feed: for each (workload, hardware), build the
 * (interactivity, output tok/s/GPU) Pareto frontier across every config —
 * frameworks, precisions, spec-decode, disagg — and read it at each tier.
 */
export function computeTcoFeed(
  rows: readonly TcoFeedSourceRow[],
  workloads: readonly TcoFeedWorkload[] = DEFAULT_WORKLOADS,
  tiers: readonly number[] = DEFAULT_TIERS,
): TcoFeedRow[] {
  const out: TcoFeedRow[] = [];

  for (const workload of workloads) {
    const byHardware = new Map<string, FrontierPoint[]>();
    for (const row of rows) {
      // Rows predating the benchmark_type column are fixed-seq by definition
      // (agentic rows are newer and carry isl/osl = null, which the workload
      // match below excludes anyway).
      if ((row.benchmark_type ?? 'single_turn') !== 'single_turn') continue;
      if (row.isl !== workload.isl || row.osl !== workload.osl) continue;
      // Chart parity: for single_turn rows the inference chart plots the
      // STORED median_intvty on the x-axis (the ingest mapper's 1/itl
      // invariant only rewrites agentic rows), so prefer the stored value
      // and fall back to 1/median_itl only for legacy rows/fixtures that
      // predate the intvty key.
      const storedIv = row.metrics.median_intvty;
      const itl = row.metrics.median_itl;
      const interactivity =
        Number.isFinite(storedIv) && storedIv > 0
          ? storedIv
          : Number.isFinite(itl) && itl > 0
            ? 1 / itl
            : undefined;
      const otput = row.metrics.output_tput_per_gpu;
      if (interactivity === undefined) continue;
      if (!Number.isFinite(otput) || otput <= 0) continue;
      const point = { interactivity, throughput: otput, date: row.date };
      const bucket = byHardware.get(row.hardware);
      if (bucket) bucket.push(point);
      else byHardware.set(row.hardware, [point]);
    }

    const workloadKey = `${workload.isl}x${workload.osl}`;
    const hardwareKeys = [...byHardware.keys()].toSorted((a, b) => a.localeCompare(b));
    for (const hardware of hardwareKeys) {
      const frontier = paretoFrontUpperLeft(
        byHardware.get(hardware)!,
        (p) => p.interactivity,
        (p) => p.throughput,
      ).toSorted((a, b) => a.interactivity - b.interactivity);
      if (frontier.length === 0) continue;

      const xs = frontier.map((p) => p.interactivity);
      const ys = frontier.map((p) => p.throughput);
      const slopes = monotoneSlopes(xs, ys);
      const minIv = xs[0];
      const maxIv = xs.at(-1)!;
      // Clamp bounds against spline overshoot, mirroring interpolateForGPU.
      const yLo = Math.min(...ys);
      const yHi = Math.max(...ys);
      // 'YYYY-MM-DD' compares chronologically as a string.
      let latest = frontier[0].date;
      let oldest = frontier[0].date;
      for (const p of frontier) {
        if (p.date > latest) latest = p.date;
        if (p.date < oldest) oldest = p.date;
      }

      for (const tier of tiers) {
        let value: number;
        let boundary: TcoTierBoundary;
        if (tier > maxIv) {
          value = 0;
          boundary = 'unreachable';
        } else if (tier < minIv) {
          value = ys[0];
          boundary = 'clamped_low';
        } else {
          const raw = hermiteInterpolate(xs, ys, slopes, tier);
          value = Math.max(yLo, Math.min(yHi, raw));
          boundary = 'interpolated';
        }
        out.push({
          hardware,
          workload: workloadKey,
          tier,
          output_tput_per_gpu: round3(value),
          boundary,
          frontier_points: frontier.length,
          frontier_min_interactivity: round3(minIv),
          frontier_max_interactivity: round3(maxIv),
          latest_date: latest,
          oldest_frontier_date: oldest,
        });
      }
    }
  }

  return out;
}

const CSV_COLUMNS = [
  'hardware',
  'workload',
  'tier',
  'output_tput_per_gpu',
  'boundary',
  'frontier_points',
  'frontier_min_interactivity',
  'frontier_max_interactivity',
  'latest_date',
  'oldest_frontier_date',
] as const;

/**
 * Serialize feed rows as CSV for one-line Power Query consumption.
 * Every value is a number, ISO date, or enum-like token (hardware keys,
 * `<isl>x<osl>`, boundary) — none can contain commas/quotes/newlines, so no
 * field quoting is needed.
 */
export function tcoFeedToCsv(rows: readonly TcoFeedRow[]): string {
  const lines = rows.map((row) => CSV_COLUMNS.map((col) => String(row[col])).join(','));
  return `${[CSV_COLUMNS.join(','), ...lines].join('\n')}\n`;
}

export interface TcoScoreRow {
  hardware: string;
  /**
   * Tier-weighted, workload-blended, output-equivalent throughput
   * (tok/s/GPU) — the single per-chip number a TCO sheet consumes.
   */
  score: number;
  /**
   * Tier-weighted output tok/s/GPU per requested workload key, BEFORE the
   * output-equivalent factor and workload blend; null = no benchmark data
   * for that workload (as opposed to 0 = every tier unreachable).
   */
  workload_scores: Record<string, number | null>;
  workloads_covered: number;
  /** Tier reads (across covered workloads) above the capability ceiling. */
  unreachable_tiers: number;
  /** Tier reads (across covered workloads) below the sweep floor. */
  clamped_tiers: number;
  /** Newest frontier-knot date across covered workloads. */
  latest_date: string;
  /** Oldest frontier-knot date across covered workloads. */
  oldest_frontier_date: string;
}

/**
 * Aggregate per-tier feed rows into one score per hardware:
 *
 *   score = Σ_covered workloads [ wWeight × (Σ_tiers tierWeight × tput) × (1 + α × ISL/OSL) ]
 *
 * - Unreachable tiers contribute 0 at full weight — the chip genuinely
 *   cannot serve that traffic segment (matches the feed's boundary docs).
 * - Workloads with no data are EXCLUDED and the workload weights are
 *   renormalized over covered ones — absence of a sweep is a coverage gap,
 *   not a capability limit; `workloads_covered` flags the reduced basis.
 * - Aggregates from the already-rounded feed values, so a consumer can
 *   reproduce `score` exactly by SUMPRODUCT over the `points` view.
 */
export function computeTcoScores(
  feedRows: readonly TcoFeedRow[],
  workloads: readonly TcoFeedWorkload[],
  tiers: readonly number[],
  tierWeights: readonly number[],
  workloadWeights: readonly number[],
  alpha: number,
): TcoScoreRow[] {
  const byHardware = new Map<string, TcoFeedRow[]>();
  for (const row of feedRows) {
    const bucket = byHardware.get(row.hardware);
    if (bucket) bucket.push(row);
    else byHardware.set(row.hardware, [row]);
  }

  const out: TcoScoreRow[] = [];
  for (const hardware of [...byHardware.keys()].toSorted((a, b) => a.localeCompare(b))) {
    const hwRows = byHardware.get(hardware)!;
    const workloadScores: Record<string, number | null> = {};
    let unreachable = 0;
    let clamped = 0;
    let latest = '';
    let oldest = '';
    let coveredWeight = 0;
    let blended = 0;

    for (const [w, workload] of workloads.entries()) {
      const key = `${workload.isl}x${workload.osl}`;
      // computeTcoFeed emits per-workload rows in `tiers` order.
      const tierRows = hwRows.filter((r) => r.workload === key);
      if (tierRows.length !== tiers.length) {
        workloadScores[key] = null;
        continue;
      }
      let weighted = 0;
      for (const [i, row] of tierRows.entries()) {
        weighted += tierWeights[i] * row.output_tput_per_gpu;
        if (row.boundary === 'unreachable') unreachable += 1;
        if (row.boundary === 'clamped_low') clamped += 1;
      }
      workloadScores[key] = round3(weighted);
      coveredWeight += workloadWeights[w];
      blended += workloadWeights[w] * weighted * (1 + (alpha * workload.isl) / workload.osl);
      // 'YYYY-MM-DD' compares chronologically as a string.
      if (latest === '' || tierRows[0].latest_date > latest) latest = tierRows[0].latest_date;
      if (oldest === '' || tierRows[0].oldest_frontier_date < oldest) {
        oldest = tierRows[0].oldest_frontier_date;
      }
    }

    // Every hardware in feedRows covers ≥1 workload, so coveredWeight can
    // only be 0 when the caller zero-weighted all its covered workloads.
    const covered = Object.values(workloadScores).filter((v) => v !== null).length;
    out.push({
      hardware,
      score: coveredWeight > 0 ? round3(blended / coveredWeight) : 0,
      workload_scores: workloadScores,
      workloads_covered: covered,
      unreachable_tiers: unreachable,
      clamped_tiers: clamped,
      latest_date: latest,
      oldest_frontier_date: oldest,
    });
  }
  return out;
}

/**
 * Serialize score rows as CSV. One `score_<isl>x<osl>` column per requested
 * workload, in request order; an uncovered workload is an empty field.
 * Same no-quoting invariant as tcoFeedToCsv — every value is a number, ISO
 * date, hardware key, or `<digits>x<digits>` workload key.
 */
export function tcoScoresToCsv(
  rows: readonly TcoScoreRow[],
  workloads: readonly TcoFeedWorkload[],
): string {
  const workloadKeys = workloads.map((w) => `${w.isl}x${w.osl}`);
  const header = [
    'hardware',
    'score',
    ...workloadKeys.map((k) => `score_${k}`),
    'workloads_covered',
    'unreachable_tiers',
    'clamped_tiers',
    'latest_date',
    'oldest_frontier_date',
  ];
  const lines = rows.map((row) =>
    [
      row.hardware,
      row.score,
      ...workloadKeys.map((k) => row.workload_scores[k] ?? ''),
      row.workloads_covered,
      row.unreachable_tiers,
      row.clamped_tiers,
      row.latest_date,
      row.oldest_frontier_date,
    ].join(','),
  );
  return `${[header.join(','), ...lines].join('\n')}\n`;
}
