import { canonical, type Json } from './bundle';
import { deploymentKey, runtimeKey } from './deployment';
import { hardwareKey, hardwareSort } from './hardware';
import type { VideoHistoryEntry, VideoHistoryObservation, VideoHistoryPage } from './history';
import type { VideoPoint } from './metrics';

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Flatten explicitly approved history entries (newest publication first) into
 * chartable points. Legacy stored sources stay in History but cannot become an
 * official dashboard point merely because their samples and shape match.
 */
export function videoPoints(pages: VideoHistoryPage[]): VideoPoint[] {
  return historyPoints(
    pages.flatMap((page) => page.entries.filter((entry) => entry.approved === true)),
  );
}

export function namedRunPoints(pages: VideoHistoryPage[], runId: string | null): VideoPoint[] {
  if (!runId || !/^[1-9]\d*$/u.test(runId) || !Number.isSafeInteger(Number(runId))) return [];
  return historyPoints(
    pages.flatMap((page) => page.entries.filter((entry) => entry.runId === runId)),
  );
}

function historyPoints(entries: VideoHistoryEntry[]): VideoPoint[] {
  const seen = new Set<string>();
  const points: VideoPoint[] = [];
  for (const entry of entries)
    for (const source of entry.sources) {
      if (source.kind !== 'observation') continue;
      for (const observation of source.observations) {
        if (seen.has(observation.id)) continue;
        seen.add(observation.id);
        points.push({
          ...toPoint(observation, entry.runId, entry.artifact.id, source.observedAt),
          publishedAt: entry.publishedAt,
          approved: entry.approved,
        });
      }
    }
  return points.toSorted(
    (a, b) =>
      hardwareSort(a.hardwareKey ?? '') - hardwareSort(b.hardwareKey ?? '') ||
      (a.concurrency ?? 0) - (b.concurrency ?? 0),
  );
}

/**
 * A plan's schema_version names its document format, not the workload; its fairness terms stay
 * in the key. Stripped on read because recorded History snapshots carry the versioned key.
 */
function workloadIdentity(key: string | null | undefined): string | null {
  if (typeof key !== 'string' || key.length === 0) return null;
  if (!key.startsWith('{')) return key;
  const identity = JSON.parse(key) as { plan?: Record<string, Json> } & Record<string, Json>;
  if (identity.plan?.schema_version === undefined) return key;
  const { schema_version: _version, ...plan } = identity.plan;
  return canonical({ ...identity, plan });
}

/** Observations published before the additive fields existed read as null, never 0. */
function toPoint(
  o: Partial<VideoHistoryObservation> & Pick<VideoHistoryObservation, 'id' | 'hardware'>,
  runId: string,
  artifactId: number,
  observedAt: string | null,
): VideoPoint {
  const server = o.server;
  return {
    results: o.results ?? null,
    id: o.id,
    runId,
    artifactId,
    cell: o.cell ?? null,
    hardwareKey: hardwareKey(o.hardware),
    hardwareName: o.hardware,
    runtime: o.runtime ?? '',
    model: o.model ?? '',
    workload: o.workload ?? '',
    workloadKey: workloadIdentity(o.workloadKey),
    concurrency: num(o.concurrency),
    participating: num(o.participating),
    allocated: num(o.allocated),
    replicas: num(o.replicas),
    valid: num(o.valid),
    completed: num(o.completed),
    scheduled: num(o.scheduled),
    failed: num(o.failed),
    samples: num(o.samples) ?? 0,
    p50: num(o.p50),
    p90: num(o.p90),
    wallSeconds: num(o.wallSeconds),
    videoSecondsPerHour: num(o.videoSecondsPerHour),
    durationSeconds: num(o.durationSeconds),
    frameCount: num(o.frameCount),
    energyKj: num(o.energyKj),
    avgPowerW: num(o.avgPowerW),
    enforcedLimitW: num(o.enforcedLimitW),
    server:
      server !== null && typeof server === 'object'
        ? {
            tp: num(server.tp),
            ulysses: num(server.ulysses),
            attention: typeof server.attention === 'string' ? server.attention : null,
          }
        : null,
    status: o.status ?? '',
    observedAt,
  };
}

/**
 * Newest published observation per (hardware, deployment, concurrency) cell,
 * where the deployment names the runtime (engine and optimizations) and server
 * layout. Points arrive newest publication first, so the first occurrence wins;
 * hardware without a registry key is kept as-is because nothing can be compared
 * against it. Two runtimes or two server layouts of one hardware are different
 * cells, so a second engine or a GPUs-per-video sweep adds points instead of
 * replacing the existing one. A cell published before layouts were recorded
 * cannot be told apart from a newer layout of the same runtime at the same GPU
 * count, so that newer cell supersedes it.
 */
export function latestVideoCells(points: VideoPoint[]): VideoPoint[] {
  const seen = new Set<string>();
  const seenGpuCounts = new Set<string>();
  return points.filter((point) => {
    if (point.hardwareKey === null) return true;
    const concurrency = point.concurrency ?? 'na';
    const key = `${point.hardwareKey}:${deploymentKey(point)}:${concurrency}`;
    const gpuCount = `${point.hardwareKey}:${runtimeKey(point)}:${point.participating ?? 'na'}:${concurrency}`;
    const layoutUnknown =
      typeof point.server?.tp !== 'number' || typeof point.server.ulysses !== 'number';
    if (seen.has(key) || (layoutUnknown && seenGpuCounts.has(gpuCount))) return false;
    seen.add(key);
    seenGpuCounts.add(gpuCount);
    return true;
  });
}

/** Valid clips a cell needs before the dashboard counts it: the same floor as the P90 display. */
export const DASHBOARD_SAMPLE_FLOOR = 10;

/** Positive when `a` was published after `b`: the published history order (time, then artifact id). */
function publicationOrder(a: VideoPoint, b: VideoPoint): number {
  return (a.publishedAt ?? '').localeCompare(b.publishedAt ?? '') || a.artifactId - b.artifactId;
}

/** Unknown legacy workloads stay inside their sealed source, never merge by display label. */
export function workloadGroup(point: Pick<VideoPoint, 'workloadKey' | 'id'>): string {
  return point.workloadKey || `unknown:${point.id.split(':')[0]}`;
}

/**
 * Cells the dashboard reads. Published history also carries smoke runs (a few
 * clips of a shorter plan) and superseded exports, while the chart, cards,
 * Compare and Evidence must all describe one frozen workload: drop cells under
 * the sample floor, keep the workload measured on the most hardware (ties: more
 * cells, then the newer publication), then the newest cell per hardware,
 * deployment (runtime and layout) and concurrency. Everything else stays
 * visible in the Performance history list.
 */
export function dashboardCells(points: VideoPoint[]): {
  cells: VideoPoint[];
  workload: string | null;
  otherWorkloads: number;
} {
  const qualified = points.filter((p) => p.samples >= DASHBOARD_SAMPLE_FLOOR);
  const hardware = new Map<string, Set<string>>();
  const cellKeys = new Map<string, Set<string>>();
  const newest = new Map<string, VideoPoint>();
  for (const p of qualified) {
    const group = workloadGroup(p);
    const hardwareId = p.hardwareKey ?? p.hardwareName;
    hardware.set(group, (hardware.get(group) ?? new Set()).add(hardwareId));
    cellKeys.set(
      group,
      (cellKeys.get(group) ?? new Set()).add(
        `${hardwareId}:${deploymentKey(p)}:${p.concurrency ?? 'na'}`,
      ),
    );
    const latest = newest.get(group);
    if (!latest || publicationOrder(p, latest) > 0) newest.set(group, p);
  }
  let workloadKey: string | null = null;
  for (const group of hardware.keys()) {
    if (workloadKey === null) {
      workloadKey = group;
      continue;
    }
    const order =
      hardware.get(group)!.size - hardware.get(workloadKey)!.size ||
      cellKeys.get(group)!.size - cellKeys.get(workloadKey)!.size ||
      publicationOrder(newest.get(group)!, newest.get(workloadKey)!);
    if (order > 0) workloadKey = group;
  }
  const others = new Set(points.map(workloadGroup));
  if (workloadKey !== null) others.delete(workloadKey);
  const cells =
    workloadKey === null
      ? []
      : latestVideoCells(qualified.filter((p) => workloadGroup(p) === workloadKey));
  return {
    cells,
    workload: cells[0]?.workload.split(' · ').slice(0, 5).join(' · ') ?? null,
    otherWorkloads: others.size,
  };
}
