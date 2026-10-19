import {
  hermiteInterpolate,
  monotoneSlopes,
  paretoFrontUpperLeft,
} from '@/components/calculator/interpolation';

export interface TcoFeedSourceRow {
  hardware: string;
  benchmark_type?: string | null;
  isl: number | null;
  osl: number | null;
  metrics: Record<string, number>;
  date: string;
  evidence_label?: string;
}

export interface TcoFeedWorkload {
  isl: number;
  osl: number;
}

export type TcoTierBoundary = 'interpolated' | 'clamped_low' | 'unreachable';

export interface TcoFeedRow {
  hardware: string;
  workload: string;
  tier: number;
  output_tput_per_gpu: number;
  boundary: TcoTierBoundary;
  is_interpolated: boolean;
  frontier_points: number;
  frontier_min_interactivity: number;
  frontier_max_interactivity: number;
  latest_date: string;
  oldest_frontier_date: string;
  evidence_date: { from: string; to: string } | null;
  evidence_labels?: string[];
}

export interface TcoTierPoint {
  interactivity: number;
  throughput: number;
  date: string;
  evidenceLabel?: string;
}

export type TcoTierRead = Omit<TcoFeedRow, 'hardware' | 'workload' | 'output_tput_per_gpu'> & {
  throughput_per_gpu: number;
};

export const DEFAULT_TIERS: readonly number[] = [30, 50, 75, 100];
export const DEFAULT_WORKLOADS: readonly TcoFeedWorkload[] = [
  { isl: 1024, osl: 1024 },
  { isl: 8192, osl: 1024 },
];
export const DEFAULT_TIER_WEIGHTS: readonly number[] = [0.35, 0.4, 0.2, 0.05];
export const DEFAULT_ALPHA = 0.25;

const MAX_TIERS = 20;
const MAX_TIER_VALUE = 10_000;
const MAX_WORKLOADS = 8;
const MAX_ALPHA = 10;

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

export function parseTierWeights(raw: string | null, tiers: readonly number[]): number[] | null {
  if (raw === null || raw.trim() === '') {
    const isDefaultTiers =
      tiers.length === DEFAULT_TIERS.length && tiers.every((t, i) => t === DEFAULT_TIERS[i]);
    if (isDefaultTiers) return [...DEFAULT_TIER_WEIGHTS];
    return tiers.map(() => 1 / tiers.length);
  }
  return parseWeightList(raw, tiers.length);
}

export function parseWorkloadWeights(
  raw: string | null,
  workloads: readonly TcoFeedWorkload[],
): number[] | null {
  if (raw === null || raw.trim() === '') return workloads.map(() => 1 / workloads.length);
  return parseWeightList(raw, workloads.length);
}

export function parseAlpha(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return DEFAULT_ALPHA;
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value < 0 || value > MAX_ALPHA) return null;
  return value;
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

function evidenceRange(a: TcoTierPoint, b: TcoTierPoint): { from: string; to: string } {
  return a.date <= b.date ? { from: a.date, to: b.date } : { from: b.date, to: a.date };
}

function evidenceLabels(a: TcoTierPoint, b: TcoTierPoint): string[] | undefined {
  const labels = [...new Set([a.evidenceLabel, b.evidenceLabel].filter(Boolean))] as string[];
  return labels.length === 0 ? undefined : labels;
}

function bracketKnots(frontier: TcoTierPoint[], tier: number): [TcoTierPoint, TcoTierPoint] {
  const last = frontier.length - 1;
  if (tier <= frontier[0].interactivity) return [frontier[0], frontier[0]];
  if (tier >= frontier[last].interactivity) return [frontier[last], frontier[last]];
  let lo = 0;
  for (let i = 0; i < last; i++) {
    if (frontier[i].interactivity === tier) return [frontier[i], frontier[i]];
    if (frontier[i].interactivity <= tier) lo = i;
  }
  return [frontier[lo], frontier[lo + 1]];
}

export function computeTierReads(
  points: readonly TcoTierPoint[],
  tiers: readonly number[],
): TcoTierRead[] {
  const frontier = paretoFrontUpperLeft(
    [...points],
    (point) => point.interactivity,
    (point) => point.throughput,
  ).toSorted((a, b) => a.interactivity - b.interactivity);
  if (frontier.length === 0) return [];

  const xs = frontier.map((point) => point.interactivity);
  const ys = frontier.map((point) => point.throughput);
  const slopes = monotoneSlopes(xs, ys);
  const minIv = xs[0];
  const maxIv = xs.at(-1)!;
  const yLo = Math.min(...ys);
  const yHi = Math.max(...ys);
  let latest = frontier[0].date;
  let oldest = frontier[0].date;
  for (const point of frontier) {
    if (point.date > latest) latest = point.date;
    if (point.date < oldest) oldest = point.date;
  }

  return tiers.map((tier) => {
    let value: number;
    let boundary: TcoTierBoundary;
    let isInterpolated = false;
    let evidenceDate: { from: string; to: string } | null;
    let tierEvidenceLabels: string[] | undefined;
    if (tier > maxIv) {
      value = 0;
      boundary = 'unreachable';
      evidenceDate = null;
    } else if (tier < minIv) {
      value = ys[0];
      boundary = 'clamped_low';
      evidenceDate = evidenceRange(frontier[0], frontier[0]);
      tierEvidenceLabels = evidenceLabels(frontier[0], frontier[0]);
    } else {
      const [lo, hi] = bracketKnots(frontier, tier);
      const raw = hermiteInterpolate(xs, ys, slopes, tier);
      value = Math.max(yLo, Math.min(yHi, raw));
      boundary = 'interpolated';
      isInterpolated = lo.interactivity !== hi.interactivity;
      evidenceDate = evidenceRange(lo, hi);
      tierEvidenceLabels = evidenceLabels(lo, hi);
    }
    return {
      tier,
      throughput_per_gpu: round3(value),
      boundary,
      is_interpolated: isInterpolated,
      frontier_points: frontier.length,
      frontier_min_interactivity: round3(minIv),
      frontier_max_interactivity: round3(maxIv),
      latest_date: latest,
      oldest_frontier_date: oldest,
      evidence_date: evidenceDate,
      ...(tierEvidenceLabels === undefined ? {} : { evidence_labels: tierEvidenceLabels }),
    };
  });
}

export function singleTurnInteractivity(metrics: Record<string, number>): number | undefined {
  const storedIv = metrics.median_intvty;
  if (Number.isFinite(storedIv) && storedIv > 0) return storedIv;
  const itl = metrics.median_itl;
  return Number.isFinite(itl) && itl > 0 ? 1 / itl : undefined;
}

export function computeTcoFeed(
  rows: readonly TcoFeedSourceRow[],
  workloads: readonly TcoFeedWorkload[] = DEFAULT_WORKLOADS,
  tiers: readonly number[] = DEFAULT_TIERS,
): TcoFeedRow[] {
  const out: TcoFeedRow[] = [];

  for (const workload of workloads) {
    const byHardware = new Map<string, TcoTierPoint[]>();
    for (const row of rows) {
      if ((row.benchmark_type ?? 'single_turn') !== 'single_turn') continue;
      if (row.isl !== workload.isl || row.osl !== workload.osl) continue;
      const interactivity = singleTurnInteractivity(row.metrics);
      const otput = row.metrics.output_tput_per_gpu;
      if (interactivity === undefined) continue;
      if (!Number.isFinite(otput) || otput <= 0) continue;
      const point = {
        interactivity,
        throughput: otput,
        date: row.date,
        evidenceLabel: row.evidence_label,
      };
      const bucket = byHardware.get(row.hardware);
      if (bucket) bucket.push(point);
      else byHardware.set(row.hardware, [point]);
    }

    const workloadKey = `${workload.isl}x${workload.osl}`;
    const hardwareKeys = [...byHardware.keys()].toSorted((a, b) => a.localeCompare(b));
    for (const hardware of hardwareKeys) {
      for (const read of computeTierReads(byHardware.get(hardware)!, tiers)) {
        const { throughput_per_gpu: outputTputPerGpu, ...rest } = read;
        out.push({
          hardware,
          workload: workloadKey,
          output_tput_per_gpu: outputTputPerGpu,
          ...rest,
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

export function tcoFeedToCsv(rows: readonly TcoFeedRow[]): string {
  const lines = rows.map((row) => CSV_COLUMNS.map((col) => String(row[col])).join(','));
  return `${[CSV_COLUMNS.join(','), ...lines].join('\n')}\n`;
}

export interface TcoScoreRow {
  hardware: string;
  score: number;
  workload_scores: Record<string, number | null>;
  workloads_covered: number;
  unreachable_tiers: number;
  clamped_tiers: number;
  latest_date: string;
  oldest_frontier_date: string;
}

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
      if (latest === '' || tierRows[0].latest_date > latest) latest = tierRows[0].latest_date;
      if (oldest === '' || tierRows[0].oldest_frontier_date < oldest) {
        oldest = tierRows[0].oldest_frontier_date;
      }
    }

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
