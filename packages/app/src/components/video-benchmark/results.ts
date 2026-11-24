import { at, generationDuration, number, rows, text, type Json } from './bundle';
import { costPerGpuHour, type CostTier } from './hardware';
import { metricValue, type VideoPoint } from './metrics';
import { chipConfigKey, compareDeployments } from './deployment';
import { engineSort } from './engines';
import { optimizationsOf } from './optimizations';
import { DASHBOARD_SAMPLE_FLOOR, latestVideoCells } from './points';
import type { ResultsEvidence } from './results-evidence';
import {
  isResultsXMetric,
  isResultsYMetric,
  type CostBasis,
  type ResultsXMetric,
  type ResultsYMetric,
} from './results-chart';

export const RESULTS_HARDWARE = [
  'gb200',
  'b300',
  'b200',
  'mi355x',
  'h200',
  'h100',
  'a100',
] as const;

/** Listed before its first matched run so readers see it is coming; other hardware appears with data. */
const PLANNED_HARDWARE: readonly string[] = ['mi355x'];

export function resultsHardwareRoster(points: readonly Pick<VideoPoint, 'hardwareKey'>[]) {
  return RESULTS_HARDWARE.filter(
    (key) => PLANNED_HARDWARE.includes(key) || points.some((point) => point.hardwareKey === key),
  );
}

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
  lossy: false,
  date: null,
  run: null,
  configs: [],
  compareFrom: null,
  compareTo: null,
  hidden: [],
  deadlineSeconds: 120,
  costTier: 'h',
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
  // Retired engine comparison: accepted so old links and API calls still work, then ignored.
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
  // Retired profit estimator: accepted so old links and API calls still work, then ignored.
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

/** Matches the overlay param in any case, as the other dashboards do (`?unofficialRun=` in PR links). */
export const isUnofficialRunParam = (key: string) => /^unofficialruns?$/iu.test(key);

export function parseResultsState(search: string | URLSearchParams): ResultsState {
  const s = typeof search === 'string' ? new URLSearchParams(search) : search;
  const overlay =
    s.get('unofficialruns') ??
    s.get('unofficialrun') ??
    [...s].find(([key, value]) => isUnofficialRunParam(key) && value)?.[1] ??
    null;
  const x = s.get('r_x'),
    y = s.get('r_y');
  const numeric = (key: string, fallback: number | null) => {
    if (!s.has(key) || s.get(key)?.trim() === '') return fallback;
    const n = Number(s.get(key));
    return Number.isFinite(n) && n > 0 ? n : fallback;
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
    unofficialRun: /^[1-9]\d*$/u.test(overlay ?? '') ? overlay : null,
    xMetric: isResultsXMetric(x) ? x : DEFAULT_RESULTS_STATE.xMetric,
    yMetric: isResultsYMetric(y) ? y : DEFAULT_RESULTS_STATE.yMetric,
    costBasis: 'participating',
    optimal: s.get('r_optimal') !== '0',
    point: s.get('r_point') || null,
  };
}

/** The share query of a state; a field at its default is left out, as `parseResultsState` restores it. */
export function resultsSearch(state: ResultsState): string {
  const s = new URLSearchParams();
  const changed = <K extends keyof ResultsState>(key: K) =>
    state[key] === DEFAULT_RESULTS_STATE[key] ? null : state[key];
  const fields = {
    r_model: state.model,
    r_workload: state.workload,
    r_resolution: state.resolution,
    r_duration: state.duration,
    r_mode: state.mode,
    r_steps: state.steps,
    r_engine: state.engine,
    r_lossy: state.lossy ? 1 : null,
    r_date: state.date,
    r_run: state.run,
    r_configs: state.configs.join(',') || null,
    r_from: state.compareFrom,
    r_to: state.compareTo,
    r_hidden: state.hidden.join(',') || null,
    r_deadline: changed('deadlineSeconds'),
    r_tier: changed('costTier'),
    r_x: changed('xMetric'),
    r_y: changed('yMetric'),
    r_optimal: state.optimal ? null : 0,
    r_point: state.point,
    unofficialruns: state.unofficialRun,
  };
  for (const [key, value] of Object.entries(fields)) if (value !== null) s.set(key, String(value));
  return s.toString();
}

/** `Wan-AI/Wan2.2-T2V-A14B-Diffusers` becomes `wan2.2-t2v-a14b-diffusers`. */
const modelSlug = (model: string) =>
  model
    .slice(model.lastIndexOf('/') + 1)
    .toLowerCase()
    .replaceAll(/[^a-z0-9.]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '');

/** Workload keys already parsed: every point of a workload shares its key, and a render reads them all. */
const parsedWorkloads = new Map<string, Json>();

function workloadIdentity(key: string | null | undefined): Json {
  if (!key) return null;
  const kept = parsedWorkloads.get(key);
  if (kept !== undefined) return kept;
  let identity: Json = null;
  try {
    identity = JSON.parse(key) as Json;
  } catch {
    /* Old sources have no canonical metadata. */
  }
  // History can page through many workloads; the handful on screen is parsed again after a reset.
  if (parsedWorkloads.size >= 256) parsedWorkloads.clear();
  parsedWorkloads.set(key, identity);
  return identity;
}

export function resultMetadata(point: VideoPoint) {
  const identity = workloadIdentity(point.workloadKey);
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
      positive(generationDuration(generation)) &&
      positive(number(at(generation, 'fps'))) &&
      positive(number(at(generation, 'num_inference_steps'))) &&
      rows(at(plan, 'cases')).length > 0 &&
      rows(at(plan, 'cases')).every(
        (c) => text(at(c, 'prompt')) && Number.isInteger(number(at(c, 'seed'))),
      ),
    ),
    model: text(at(plan, 'model_id')) || point.model,
    resolution: positive(width) && positive(height) ? `${width}×${height}` : null,
    duration: generationDuration(generation) ?? point.durationSeconds,
    steps: number(at(generation, 'num_inference_steps')),
    fps: number(at(generation, 'fps')),
    measurementBoundary: text(at(identity, 'semantics', 'boundary')) || null,
    mode: point.results?.mode ?? (text(at(generation, 'mode')) || text(at(plan, 'mode')) || null),
    engine: point.results?.engine ?? null,
    optimizations: optimizationsOf(point),
    date: point.observedAt?.slice(0, 10) ?? null,
  };
}
/** The selected workload in one line: model, resolution, duration, fps, steps and mode. */
export function workloadSummary(point: VideoPoint, stepsUnit: string): string {
  const metadata = resultMetadata(point);
  return [
    metadata.model,
    metadata.resolution,
    metadata.duration === null ? null : `${Number(metadata.duration.toFixed(2))} s`,
    metadata.fps === null ? null : `${metadata.fps} fps`,
    metadata.steps === null ? null : `${metadata.steps} ${stepsUnit}`,
    metadata.mode?.toUpperCase(),
  ]
    .filter(Boolean)
    .join(' · ');
}
export interface ResultCost {
  perVideo: number;
  perVideoSecond: number | null;
  perHour: number;
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

// Preserve sub-millisecond precision in Python's ISO timestamps while comparing UTC instants.
function executionTime(observedAt: string | null): string {
  if (!observedAt) return '';
  const millis = Date.parse(observedAt);
  if (!Number.isFinite(millis)) return '';
  const subMillis = observedAt.match(/\.\d{3}(?<subMillis>\d+)/u)?.groups?.subMillis ?? '';
  return new Date(millis).toISOString().slice(0, -1) + subMillis.replace(/0+$/u, '');
}

/** A run may measure multiple workloads at different times. Order each within its own workload. */
function runTimeline(points: VideoPoint[]) {
  return [...Map.groupBy(points, (p) => p.runId)]
    .flatMap(([id, members]) =>
      [...Map.groupBy(members, (p) => p.workloadKey)].map(([workload, cells]) => {
        const starts = cells.map((p) => executionTime(p.observedAt)).filter(Boolean);
        const start = starts.toSorted()[0] ?? '';
        return { id, date: start.slice(0, 10), start, workload, cells };
      }),
    )
    .toSorted(compareRunTime);
}

function compareRunTime(a: { start: string; id: string }, b: { start: string; id: string }) {
  return a.start.localeCompare(b.start) || Number(a.id) - Number(b.id);
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

/** Workload keys, the one most hardware types cover first. */
function byCoverage(cohort: VideoPoint[]): string[] {
  const coverage = new Map<string, Set<string>>();
  for (const p of cohort)
    coverage.set(p.workloadKey!, (coverage.get(p.workloadKey!) ?? new Set()).add(p.hardwareKey!));
  return [...coverage].toSorted((a, b) => b[1].size - a[1].size).map(([key]) => key);
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
  // Share a model slug or a source point ID, not the canonical JSON containing every prompt and seed.
  // Comparison still uses the complete canonical identity after resolving the selector.
  const workloads = new Map<string, { key: string; label: string; model: string; slug: string }>();
  for (const point of available)
    if (!workloads.has(point.workloadKey!))
      workloads.set(point.workloadKey!, {
        key: point.id,
        label: point.workload,
        model: point.model,
        // The plan's model, as the workload selector names it.
        slug: modelSlug(resultMetadata(point).model),
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
  const preferred = byCoverage(matches.length > 0 ? matches : namedMatches)[0] ?? null;
  // A model slug is the readable selector of that model's best-covered official workload. It
  // ignores the filters, so a link keeps its workload when they change. Every other workload,
  // including one only a named run publishes, shares a point ID.
  const ranked = byCoverage(qualified);
  const slugged = (slug: string) => ranked.find((key) => workloads.get(key)!.slug === slug) ?? null;
  const workloadKey =
    state.workload === null
      ? preferred
      : (available.find((point) => point.id === state.workload)?.workloadKey ??
        slugged(state.workload));
  const official = matches.filter(
    (p) => p.workloadKey === workloadKey && p.runId !== state.unofficialRun,
  );
  const timeline = runTimeline(
    qualified.filter((p) => {
      if (p.runId === state.unofficialRun) return false;
      if (p.workloadKey === workloadKey) return matchesFilters(p);
      const m = resultMetadata(p);
      return (
        (!state.model || m.model === state.model) && (!state.engine || m.engine === state.engine)
      );
    }),
  );
  const workloadTimeline = timeline.filter((r) => r.workload === workloadKey);
  const runs: ResultsRun[] = workloadTimeline.map(({ id, date }) => ({ id, date }));
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
  const date = state.date;
  const asOf = date === null ? timeline : timeline.filter((r) => r.date !== '' && r.date <= date);
  const day = asOf.findLast((r) => r.workload === workloadKey)?.date;
  const dayRuns = workloadTimeline.filter((r) => r.date === day);
  const selected = dayRuns.find((r) => r.id === state.run) ?? dayRuns.at(-1);
  const run: ResultsRun | null = selected ? { id: selected.id, date: selected.date } : null;
  // Backfills arrive in publication order. Visit the newest execution first across runs,
  // preserving publication order inside a run for corrected exports of the same deployment.
  const bounded =
    selected && (date !== null || state.run !== null)
      ? asOf.filter((r) => compareRunTime(r, selected) <= 0)
      : asOf;
  const snapshot = bounded
    .toReversed()
    .flatMap((r) => r.cells)
    .filter((p) => !state.hidden.includes(p.hardwareKey ?? ''));
  const deploymentCells = latest(snapshot.filter((p) => p.workloadKey === workloadKey)).map((p) =>
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
    snapshot.filter((p) => state.gpuCount === null || p.participating === state.gpuCount),
  ).map((p) => resultCell(p, state));
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
      workloads: [...workloads]
        .filter(([, w]) => !state.model || w.model === state.model)
        .map(([canonical, { key, label, slug }]) => ({
          key,
          label,
          ...(slug && slugged(slug) === canonical ? { slug } : {}),
        })),
    },
    excludedCount: points.length - qualified.length,
    sampleFloor: DASHBOARD_SAMPLE_FLOOR,
    scheduledClips: 20,
    roster: resultsHardwareRoster(available),
  };
}
