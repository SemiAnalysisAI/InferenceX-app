import { at, number, rows, text, type Json } from './bundle';
import { costPerGpuHour, type CostTier } from './hardware';
import { metricValue, type VideoPoint } from './metrics';
import { chipConfigKey, compareDeployments } from './deployment';
import { engineSort } from './engines';
import { optimizationsOf } from './optimizations';
import { DASHBOARD_SAMPLE_FLOOR, latestVideoCells } from './points';
import type { ResultsEvidence } from './results-evidence';
import {
  isResultsYMetric,
  type CostBasis,
  type ResultsXMetric,
  type ResultsYMetric,
} from './results-chart';

export const RESULTS_HARDWARE = ['gb200', 'b200', 'mi355x', 'h200', 'h100'] as const;

/** Listed before its first matched run so readers see it is coming; other hardware appears with data. */
const PLANNED_HARDWARE: readonly string[] = ['mi355x'];

export function resultsHardwareRoster(points: readonly Pick<VideoPoint, 'hardwareKey'>[]) {
  return RESULTS_HARDWARE.filter(
    (key) => PLANNED_HARDWARE.includes(key) || points.some((point) => point.hardwareKey === key),
  );
}
export type VideoMode = 't2v' | 'i2v' | 'r2v';

export const MAX_CHIP_CONFIGS = 4;
export interface ResultsState {
  model: string | null;
  workload: string | null;
  resolution: string | null;
  duration: number | null;
  mode: string | null;
  steps: number | null;
  gpuCount: number | null;
  /** Limits cells to one engine; null keeps every engine. */
  engine: string | null;
  /** Plot every engine's lossless series per hardware, not only the best one. */
  compareEngines: boolean;
  /** Also plot lossy-optimization series; they never compete for a hardware's default line. */
  lossy: boolean;
  /** As-of execution date: each deployment's latest run measured on or before it. */
  date: string | null;
  /** Run on the selected date to view as of; null is that date's last run. */
  run: string | null;
  /** Chip configs whose runs the chart compares over time; empty shows the selected run. */
  configs: string[];
  compareFrom: string | null;
  compareTo: string | null;
  hidden: string[];
  deadlineSeconds: number;
  costTier: CostTier;
  apiPrice: number | null;
  apiPrices: Record<VideoMode, number | null>;
  utilization: number;
  unofficialRun: string | null;
  xMetric: ResultsXMetric;
  yMetric: ResultsYMetric;
  costBasis: CostBasis;
  optimal: boolean;
  /** `resultsPointKey` of the deployment whose detail view is open. */
  point: string | null;
}
export const DEFAULT_RESULTS_STATE: ResultsState = {
  model: null,
  workload: null,
  resolution: null,
  duration: null,
  mode: null,
  steps: null,
  gpuCount: null,
  engine: null,
  compareEngines: false,
  lossy: false,
  date: null,
  run: null,
  configs: [],
  compareFrom: null,
  compareTo: null,
  hidden: [],
  deadlineSeconds: 120,
  costTier: 'h',
  apiPrice: null,
  apiPrices: { t2v: null, i2v: null, r2v: null },
  utilization: 1,
  unofficialRun: null,
  xMetric: 'p50',
  yMetric: 'videoSecondsPerDollar',
  costBasis: 'participating',
  optimal: true,
  point: null,
};
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const positive = (n: unknown): n is number => finite(n) && n > 0;
export const RESULTS_QUERY_PARAMS = [
  'r_model',
  'r_workload',
  'r_resolution',
  'r_duration',
  'r_mode',
  'r_steps',
  'r_gpus',
  'r_engine',
  'r_compare',
  'r_lossy',
  'r_date',
  'r_run',
  'r_configs',
  'r_from',
  'r_to',
  'r_hidden',
  'r_deadline',
  'r_tier',
  'r_api',
  'r_price_t2v',
  'r_price_i2v',
  'r_price_r2v',
  'r_utilization',
  'r_x',
  'r_y',
  'r_basis',
  'r_optimal',
  'r_point',
  'unofficialrun',
  'unofficialruns',
] as const;

export function parseResultsState(search: string | URLSearchParams): ResultsState {
  const s = typeof search === 'string' ? new URLSearchParams(search) : search;
  const overlay = s.get('unofficialruns') ?? s.get('unofficialrun');
  const y = s.get('r_y');
  const numeric = (key: string, fallback: number | null, allowZero = false) => {
    if (!s.has(key) || s.get(key)?.trim() === '') return fallback;
    const n = Number(s.get(key));
    return Number.isFinite(n) && (allowZero ? n >= 0 : n > 0) ? n : fallback;
  };
  return {
    model: s.get('r_model') || null,
    workload: s.get('r_workload') || null,
    resolution: s.get('r_resolution') || null,
    duration: numeric('r_duration', null),
    mode: s.get('r_mode') || null,
    steps: numeric('r_steps', null),
    // Retired overview controls cannot be restored by an old shared link.
    gpuCount: null,
    engine: s.get('r_engine') || null,
    // One selected engine leaves nothing to compare.
    compareEngines: !s.get('r_engine') && s.get('r_compare') === '1',
    lossy: s.get('r_lossy') === '1',
    date: s.get('r_date') || null,
    run: /^[1-9]\d*$/u.test(s.get('r_run') ?? '') ? s.get('r_run') : null,
    configs: [...new Set((s.get('r_configs') ?? '').split(',').filter(Boolean))].slice(
      0,
      MAX_CHIP_CONFIGS,
    ),
    compareFrom: s.get('r_from') || null,
    compareTo: s.get('r_to') || null,
    hidden: [...new Set((s.get('r_hidden') ?? '').split(',').filter(Boolean))],
    deadlineSeconds: numeric('r_deadline', 120)!,
    costTier: s.get('r_tier') === 'r' ? 'r' : 'h',
    apiPrice: numeric('r_api', null, true),
    apiPrices: {
      t2v: numeric('r_price_t2v', null, true),
      i2v: numeric('r_price_i2v', null, true),
      r2v: numeric('r_price_r2v', null, true),
    },
    utilization: Math.min(numeric('r_utilization', 1, true)!, 1),
    unofficialRun: /^[1-9]\d*$/u.test(overlay ?? '') ? overlay : null,
    xMetric: 'p50',
    yMetric: isResultsYMetric(y) ? y : DEFAULT_RESULTS_STATE.yMetric,
    costBasis: 'participating',
    optimal: s.get('r_optimal') !== '0',
    point: s.get('r_point') || null,
  };
}

export function resultsSearch(state: ResultsState): string {
  const s = new URLSearchParams();
  const fields = {
    r_model: state.model,
    r_workload: state.workload,
    r_resolution: state.resolution,
    r_duration: state.duration,
    r_mode: state.mode,
    r_steps: state.steps,
    r_engine: state.engine,
    r_compare: state.compareEngines ? 1 : null,
    r_lossy: state.lossy ? 1 : null,
    r_date: state.date,
    r_run: state.run,
    r_configs: state.configs.join(',') || null,
    r_from: state.compareFrom,
    r_to: state.compareTo,
    r_hidden: state.hidden.join(',') || null,
    r_deadline: state.deadlineSeconds,
    r_tier: state.costTier,
    r_api: state.apiPrice,
    r_price_t2v: state.apiPrices.t2v,
    r_price_i2v: state.apiPrices.i2v,
    r_price_r2v: state.apiPrices.r2v,
    r_utilization: state.utilization,
    r_y: state.yMetric,
    r_optimal: state.optimal ? 1 : 0,
    r_point: state.point,
    unofficialruns: state.unofficialRun,
  };
  for (const [key, value] of Object.entries(fields)) if (value !== null) s.set(key, String(value));
  return s.toString();
}

export function resultMetadata(point: VideoPoint) {
  let identity: Json = null;
  try {
    identity = JSON.parse(point.workloadKey ?? 'null') as Json;
  } catch {
    /* Old sources have no canonical metadata. */
  }
  const plan = at(identity, 'plan');
  const generation = at(plan, 'generation');
  const width = number(at(generation, 'width')),
    height = number(at(generation, 'height'));
  return {
    canonicalWorkload: Boolean(
      text(at(plan, 'model_id')) &&
      text(at(plan, 'model_revision')) &&
      positive(width) &&
      positive(height) &&
      positive(number(at(generation, 'duration_seconds'))) &&
      positive(number(at(generation, 'fps'))) &&
      positive(number(at(generation, 'num_inference_steps'))) &&
      rows(at(plan, 'cases')).length > 0 &&
      rows(at(plan, 'cases')).every(
        (c) => text(at(c, 'prompt')) && Number.isInteger(number(at(c, 'seed'))),
      ),
    ),
    model: text(at(plan, 'model_id')) || point.model,
    resolution: positive(width) && positive(height) ? `${width}×${height}` : null,
    duration: number(at(generation, 'duration_seconds')) ?? point.durationSeconds,
    steps: number(at(generation, 'num_inference_steps')),
    fps: number(at(generation, 'fps')),
    measurementBoundary: text(at(identity, 'semantics', 'boundary')) || null,
    mode: point.results?.mode ?? (text(at(generation, 'mode')) || text(at(plan, 'mode')) || null),
    engine: point.results?.engine ?? null,
    optimizations: optimizationsOf(point),
    date: point.observedAt?.slice(0, 10) ?? null,
  };
}
export interface ResultCost {
  perVideo: number;
  perVideoSecond: number | null;
  perHour: number;
}
export interface ResultProfit {
  revenuePerHour: number;
  profitPerHour: number;
  revenuePerGpuHour: number;
  profitPerGpuHour: number;
}
export interface ResultCell {
  overlay: boolean;
  point: VideoPoint;
  metadata: ReturnType<typeof resultMetadata>;
  clipsPerSecond: number | null;
  videoSecondsPerSecond: number | null;
  joulesPerClip: number | null;
  joulesPerFrame: number | null;
  p95: number | null;
  deliveryP50: number | null;
  deadlineAttainment: number | null;
  deadlineGoodput: number | null;
  cost: Record<'participating' | 'allocated', ResultCost | null>;
  profit: Record<'participating' | 'allocated', ResultProfit | null>;
  evidence: ResultsEvidence | null;
}
function resultCell(point: VideoPoint, state: ResultsState): ResultCell {
  const metadata = resultMetadata(point);
  const clipsPerSecond =
    positive(point.valid) && positive(point.wallSeconds) ? point.valid / point.wallSeconds : null;
  const videoSecondsPerSecond = positive(point.videoSecondsPerHour)
    ? point.videoSecondsPerHour / 3600
    : null;
  const energy = metricValue(point, 'kjPerVideo', { tier: state.costTier });
  const joulesPerClip = energy === null ? null : energy * 1000;
  const price =
    metadata.mode && metadata.mode in state.apiPrices
      ? state.apiPrices[metadata.mode as VideoMode]
      : state.apiPrice;
  const cost = (gpuCount: number | null): ResultCost | null => {
    const hourly = point.hardwareKey ? costPerGpuHour(point.hardwareKey, state.costTier) : null;
    if (
      !positive(gpuCount) ||
      !Number.isSafeInteger(gpuCount) ||
      (positive(point.participating) && gpuCount < point.participating) ||
      hourly === null ||
      clipsPerSecond === null
    )
      return null;
    const perHour = gpuCount * hourly,
      perVideo = perHour / (clipsPerSecond * 3600);
    return {
      perVideo,
      perVideoSecond: positive(point.videoSecondsPerHour)
        ? perHour / point.videoSecondsPerHour
        : null,
      perHour,
    };
  };
  const participating = cost(point.participating),
    allocated = cost(point.allocated);
  const profit = (costs: ResultCost | null, gpuCount: number | null): ResultProfit | null => {
    if (
      costs === null ||
      !positive(gpuCount) ||
      !finite(price) ||
      price < 0 ||
      videoSecondsPerSecond === null ||
      !finite(state.utilization) ||
      state.utilization < 0 ||
      state.utilization > 1
    )
      return null;
    const revenuePerHour = videoSecondsPerSecond * 3600 * price * state.utilization;
    const profitPerHour = revenuePerHour - costs.perHour;
    return {
      revenuePerHour,
      profitPerHour,
      revenuePerGpuHour: revenuePerHour / gpuCount,
      profitPerGpuHour: profitPerHour / gpuCount,
    };
  };
  const times = point.results?.latencies;
  const delivered =
    times && times.length === point.valid
      ? times.filter((t) => t <= state.deadlineSeconds).length
      : null;
  return {
    overlay: point.runId === state.unofficialRun,
    point,
    metadata,
    clipsPerSecond,
    videoSecondsPerSecond,
    joulesPerClip,
    joulesPerFrame:
      joulesPerClip !== null && positive(point.frameCount)
        ? joulesPerClip / point.frameCount
        : null,
    p95:
      times && times.length === point.valid && times.length >= 20
        ? times[Math.ceil(times.length * 0.95) - 1]
        : null,
    deliveryP50: point.results
      ? (point.results.clientP50 ?? null)
      : metadata.measurementBoundary === 'submit_to_downloaded_media'
        ? point.p50
        : null,
    deadlineAttainment:
      delivered !== null && positive(point.valid) ? delivered / point.valid : null,
    deadlineGoodput:
      delivered !== null && positive(point.wallSeconds) ? delivered / point.wallSeconds : null,
    cost: { participating, allocated },
    profit: {
      participating: profit(participating, point.participating),
      allocated: profit(allocated, point.allocated),
    },
    evidence: point.results ?? null,
  };
}

const values = <T extends string | number>(items: (T | null)[]) => [
  ...new Set(items.filter((x): x is T => x !== null)),
];
/** Newest cell per workload, hardware, deployment and concurrency; engines never replace each other. */
const latest = (input: VideoPoint[]) =>
  [...Map.groupBy(input, (point) => point.workloadKey).values()].flatMap(latestVideoCells);

/** One published official run of the selected workload, in measurement order. */
export interface ResultsRun {
  id: string;
  /** Execution date of the run's first observation, YYYY-MM-DD. */
  date: string;
}

/** Runs ordered by first observation, ties broken by GitHub run ID. */
function workloadRuns(points: readonly VideoPoint[]): ResultsRun[] {
  const first = new Map<string, string>();
  for (const point of points) {
    const observed = point.observedAt ?? '';
    const seen = first.get(point.runId);
    if (seen === undefined || observed < seen) first.set(point.runId, observed);
  }
  return [...first]
    .toSorted(([a, aAt], [b, bAt]) => aAt.localeCompare(bAt) || Number(a) - Number(b))
    .map(([id, observed]) => ({ id, date: observed.slice(0, 10) }));
}

function qualifies(p: VideoPoint): boolean {
  return Boolean(
    RESULTS_HARDWARE.some((key) => key === p.hardwareKey) &&
    p.workloadKey &&
    resultMetadata(p).canonicalWorkload &&
    p.concurrency === 1 &&
    p.scheduled === 20 &&
    p.samples >= DASHBOARD_SAMPLE_FLOOR &&
    positive(p.valid) &&
    p.valid >= DASHBOARD_SAMPLE_FLOOR &&
    p.status === 'complete',
  );
}

export function resultProjection(
  points: VideoPoint[],
  state: ResultsState,
  namedPoints: VideoPoint[] = [],
) {
  const qualified = points.filter(qualifies);
  const named =
    state.unofficialRun === null
      ? []
      : [
          ...new Map(
            [...qualified, ...namedPoints]
              .filter((point) => point.runId === state.unofficialRun && qualifies(point))
              .map((point) => [point.id, point]),
          ).values(),
        ];
  const approvedIds = new Set(qualified.map((point) => point.id));
  const available = [...qualified, ...named.filter((point) => !approvedIds.has(point.id))];
  const metadata = available.map(resultMetadata);
  // Share a source point ID, not the canonical JSON containing every prompt and seed.
  // Comparison still uses the complete canonical identity after resolving the selector.
  const workloads = new Map<string, { key: string; label: string; model: string }>();
  for (const point of available)
    if (!workloads.has(point.workloadKey!))
      workloads.set(point.workloadKey!, {
        key: point.id,
        label: point.workload,
        model: point.model,
      });
  const matchesFilters = (p: VideoPoint) => {
    const m = resultMetadata(p);
    return (
      (!state.model || m.model === state.model) &&
      (!state.resolution || m.resolution === state.resolution) &&
      (state.duration === null || m.duration === state.duration) &&
      (!state.mode || m.mode === state.mode) &&
      (state.steps === null || m.steps === state.steps) &&
      (!state.engine || m.engine === state.engine)
    );
  };
  const matches = qualified.filter(matchesFilters);
  const namedMatches = named.filter(matchesFilters);
  const coverage = new Map<string, Set<string>>();
  for (const p of matches.length > 0 ? matches : namedMatches)
    coverage.set(p.workloadKey!, (coverage.get(p.workloadKey!) ?? new Set()).add(p.hardwareKey!));
  const preferred = [...coverage].toSorted((a, b) => b[1].size - a[1].size)[0]?.[0] ?? null;
  const workloadKey =
    state.workload === null
      ? preferred
      : (available.find((point) => point.id === state.workload)?.workloadKey ?? null);
  const official = matches.filter(
    (p) => p.workloadKey === workloadKey && p.runId !== state.unofficialRun,
  );
  const runs = workloadRuns(official);
  const chipConfigs = [...new Map(official.map((p) => [chipConfigKey(p), p]))]
    .map(([key, point]) => ({ key, point }))
    .toSorted((a, b) => compareDeployments(a.point, b.point) || a.key.localeCompare(b.key));
  // A key this workload does not offer (an old share link) compares nothing, so the run shows.
  const configs = state.configs.filter((key) => chipConfigs.some((config) => config.key === key));
  const comparedRuns = Map.groupBy(
    official.filter((p) => {
      const date = p.observedAt?.slice(0, 10) ?? '';
      return (
        configs.includes(chipConfigKey(p)) &&
        (state.compareFrom === null || date >= state.compareFrom) &&
        (state.compareTo === null || date <= state.compareTo)
      );
    }),
    (p) => p.runId,
  );
  const history = [
    ...[...comparedRuns.values()].flatMap(latest),
    ...latest(
      namedMatches.filter(
        (p) => p.workloadKey === workloadKey && configs.includes(chipConfigKey(p)),
      ),
    ),
  ].map((p) => resultCell(p, state));
  const asOf = state.date === null ? runs : runs.filter((r) => r.date <= state.date!);
  const day = asOf.at(-1)?.date ?? runs[0]?.date ?? null;
  const dayRuns = runs.filter((r) => r.date === day);
  const run = dayRuns.find((r) => r.id === state.run) ?? dayRuns.at(-1) ?? null;
  const shownRuns = new Set(
    runs.slice(0, run === null ? 0 : runs.indexOf(run) + 1).map((r) => r.id),
  );
  const common = matches.filter(
    (p) =>
      p.workloadKey === workloadKey &&
      !state.hidden.includes(p.hardwareKey ?? '') &&
      (p.runId === state.unofficialRun || shownRuns.has(p.runId)),
  );
  const deploymentCells = latest(common.filter((p) => p.runId !== state.unofficialRun)).map((p) =>
    resultCell(p, state),
  );
  const cells = deploymentCells.filter(
    (p) => state.gpuCount === null || p.point.participating === state.gpuCount,
  );
  const overlayDeploymentCells = latest(
    namedMatches.filter(
      (p) => p.workloadKey === workloadKey && !state.hidden.includes(p.hardwareKey ?? ''),
    ),
  ).map((p) => resultCell(p, state));
  const overlayCells = overlayDeploymentCells.filter(
    (cell) => state.gpuCount === null || cell.point.participating === state.gpuCount,
  );
  const workloadMix = latest(
    qualified.filter((point) => {
      const m = resultMetadata(point);
      return (
        (!state.model || m.model === state.model) &&
        (!state.engine || m.engine === state.engine) &&
        (point.workloadKey === workloadKey
          ? shownRuns.has(point.runId)
          : state.date === null || day === null || (m.date !== null && m.date <= day)) &&
        (state.gpuCount === null || point.participating === state.gpuCount) &&
        !state.hidden.includes(point.hardwareKey ?? '') &&
        point.runId !== state.unofficialRun
      );
    }),
  ).map((point) => {
    const cell = resultCell(point, state);
    return point.workloadKey === workloadKey
      ? cell
      : { ...cell, profit: { participating: null, allocated: null } };
  });
  return {
    state: {
      ...state,
      workload: workloadKey === null ? state.workload : workloads.get(workloadKey)!.key,
      configs,
    },
    cells,
    overlayCells,
    deploymentCells,
    overlayDeploymentCells,
    allCells: deploymentCells,
    workloadMix,
    workloadKey,
    runs,
    run,
    chipConfigs,
    history,
    options: {
      models: values(metadata.map((m) => m.model)),
      resolutions: values(metadata.map((m) => m.resolution)),
      durations: values(metadata.map((m) => m.duration)),
      modes: values(metadata.map((m) => m.mode)),
      steps: values(metadata.map((m) => m.steps)),
      gpuCounts: values(available.map((p) => p.participating)),
      // The selected workload's engines, before the engine filter: another workload's
      // engine would offer a choice this cohort cannot show.
      engines: values(
        available.filter((p) => p.workloadKey === workloadKey).map((p) => resultMetadata(p).engine),
      ).toSorted((a, b) => engineSort(a) - engineSort(b)),
      dates: values(runs.map((r) => r.date)),
      workloads: [...workloads.values()]
        .filter((w) => !state.model || w.model === state.model)
        .map(({ key, label }) => ({ key, label })),
    },
    excludedCount: points.length - qualified.length,
    sampleFloor: DASHBOARD_SAMPLE_FLOOR,
    scheduledClips: 20,
    roster: resultsHardwareRoster(available),
  };
}
