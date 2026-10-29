import { at, number, rows, text, type Json } from './bundle';
import { costPerGpuHour, type CostTier } from './hardware';
import { metricValue, type VideoPoint } from './metrics';
import { DASHBOARD_SAMPLE_FLOOR, latestVideoCells } from './points';
import type { ResultsEvidence } from './results-evidence';

export const RESULTS_HARDWARE = ['gb200', 'b200', 'mi355x', 'h200'] as const;
export type VideoMode = 't2v' | 'i2v' | 'r2v';
export interface ResultsState {
  model: string | null;
  workload: string | null;
  resolution: string | null;
  duration: number | null;
  mode: string | null;
  steps: number | null;
  gpuCount: number | null;
  engine: string | null;
  date: string | null;
  hidden: string[];
  deadlineSeconds: number;
  costTier: CostTier;
  apiPrice: number | null;
  apiPrices: Record<VideoMode, number | null>;
  utilization: number;
  unofficialRun: string | null;
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
  date: null,
  hidden: [],
  deadlineSeconds: 120,
  costTier: 'h',
  apiPrice: null,
  apiPrices: { t2v: null, i2v: null, r2v: null },
  utilization: 1,
  unofficialRun: null,
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
  'r_date',
  'r_hidden',
  'r_deadline',
  'r_tier',
  'r_api',
  'r_price_t2v',
  'r_price_i2v',
  'r_price_r2v',
  'r_utilization',
  'unofficialrun',
  'unofficialruns',
] as const;

export function parseResultsState(search: string | URLSearchParams): ResultsState {
  const s = typeof search === 'string' ? new URLSearchParams(search) : search;
  const overlay = s.get('unofficialruns') ?? s.get('unofficialrun');
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
    gpuCount: numeric('r_gpus', null),
    engine: s.get('r_engine') || null,
    date: s.get('r_date') || null,
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
    r_gpus: state.gpuCount,
    r_engine: state.engine,
    r_date: state.date,
    r_hidden: state.hidden.join(',') || null,
    r_deadline: state.deadlineSeconds,
    r_tier: state.costTier,
    r_api: state.apiPrice,
    r_price_t2v: state.apiPrices.t2v,
    r_price_i2v: state.apiPrices.i2v,
    r_price_r2v: state.apiPrices.r2v,
    r_utilization: state.utilization,
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
  const videoSecondsPerSecond =
    clipsPerSecond !== null && positive(point.durationSeconds)
      ? clipsPerSecond * point.durationSeconds
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
      perVideoSecond: positive(point.durationSeconds) ? perVideo / point.durationSeconds : null,
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
const latest = (input: VideoPoint[]) => {
  const groups = new Map<string, VideoPoint[]>();
  for (const point of input) {
    const key = JSON.stringify([point.workloadKey, point.results?.engine ?? point.runtime]);
    groups.set(key, [...(groups.get(key) ?? []), point]);
  }
  return [...groups.values()].flatMap(latestVideoCells);
};

export function resultProjection(points: VideoPoint[], state: ResultsState) {
  const qualified = points.filter(
    (p) =>
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
  const metadata = qualified.map(resultMetadata);
  // Share a source point ID, not the canonical JSON containing every prompt and seed.
  // Comparison still uses the complete canonical identity after resolving the selector.
  const workloads = new Map<string, { key: string; label: string; model: string }>();
  for (const point of qualified)
    if (!workloads.has(point.workloadKey!))
      workloads.set(point.workloadKey!, {
        key: point.id,
        label: point.workload,
        model: point.model,
      });
  const matches = qualified.filter((p) => {
    const m = resultMetadata(p);
    return (
      (!state.model || m.model === state.model) &&
      (!state.resolution || m.resolution === state.resolution) &&
      (state.duration === null || m.duration === state.duration) &&
      (!state.mode || m.mode === state.mode) &&
      (state.steps === null || m.steps === state.steps) &&
      (!state.engine || m.engine === state.engine) &&
      (!state.date || m.date === state.date)
    );
  });
  const coverage = new Map<string, Set<string>>();
  for (const p of matches)
    coverage.set(p.workloadKey!, (coverage.get(p.workloadKey!) ?? new Set()).add(p.hardwareKey!));
  const preferred = [...coverage].toSorted((a, b) => b[1].size - a[1].size)[0]?.[0] ?? null;
  const workloadKey =
    state.workload === null
      ? preferred
      : ([...workloads].find(([, item]) => item.key === state.workload)?.[0] ?? null);
  const common = matches.filter(
    (p) => p.workloadKey === workloadKey && !state.hidden.includes(p.hardwareKey ?? ''),
  );
  const deploymentCells = latest(common.filter((p) => p.runId !== state.unofficialRun)).map((p) =>
    resultCell(p, state),
  );
  const cells = deploymentCells.filter(
    (p) => state.gpuCount === null || p.point.participating === state.gpuCount,
  );
  const overlayCells = latest(
    common.filter(
      (p) =>
        p.runId === state.unofficialRun &&
        (state.gpuCount === null || p.participating === state.gpuCount),
    ),
  ).map((p) => resultCell(p, state));
  const workloadMix = latest(
    qualified.filter((point) => {
      const m = resultMetadata(point);
      return (
        (!state.model || m.model === state.model) &&
        (!state.engine || m.engine === state.engine) &&
        (!state.date || m.date === state.date) &&
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
    },
    cells,
    overlayCells,
    deploymentCells,
    allCells: deploymentCells,
    workloadMix,
    workloadKey,
    options: {
      models: values(metadata.map((m) => m.model)),
      resolutions: values(metadata.map((m) => m.resolution)),
      durations: values(metadata.map((m) => m.duration)),
      modes: values(metadata.map((m) => m.mode)),
      steps: values(metadata.map((m) => m.steps)),
      gpuCounts: values(qualified.map((p) => p.participating)),
      engines: values(metadata.map((m) => m.engine)),
      dates: values(metadata.map((m) => m.date)),
      workloads: [...workloads.values()]
        .filter((w) => !state.model || w.model === state.model)
        .map(({ key, label }) => ({ key, label })),
    },
    excludedCount: points.length - qualified.length,
    sampleFloor: DASHBOARD_SAMPLE_FLOOR,
    scheduledClips: 20,
    roster: RESULTS_HARDWARE,
  };
}
