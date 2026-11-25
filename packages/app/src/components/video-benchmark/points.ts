import { canonical, type Json } from './bundle';
import { chipConfigKey, deploymentKey, runtimeKey } from './deployment';
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

export const RESULTS_HARDWARE = [
  'gb200',
  'b300',
  'b200',
  'mi355x',
  'h200',
  'h100',
  'a100',
] as const;

/** Valid clips a cell needs before the dashboard counts it, so a smoke run of a few clips stays in History only. */
export const DASHBOARD_SAMPLE_FLOOR = 10;

/**
 * The one admission rule of /vgx, its API and the History carry: a complete 20-clip run at
 * concurrency 1 of a known workload on listed hardware, with at least the sample floor.
 */
export function qualifies(p: VideoPoint): boolean {
  return Boolean(
    RESULTS_HARDWARE.some((key) => key === p.hardwareKey) &&
    p.workloadKey &&
    p.concurrency === 1 &&
    p.scheduled === 20 &&
    p.samples >= DASHBOARD_SAMPLE_FLOOR &&
    p.status === 'complete',
  );
}

/** Qualified approved cells, keyed by workload, hardware and deployment. */
const qualifiedCells = (entries: VideoHistoryEntry[]) =>
  historyPoints(entries.filter((entry) => entry.approved === true))
    .filter(qualifies)
    .map((p) => `${p.workloadKey}:${chipConfigKey(p)}`);

/**
 * Approved entries of `older` (newest first) holding a qualified cell that neither `window` nor a
 * newer entry of `older` holds, so a deployment's latest source stays readable however many newer
 * sources other deployments publish.
 */
export function latestOlderEntries(
  window: VideoHistoryEntry[],
  older: VideoHistoryEntry[],
): VideoHistoryEntry[] {
  const seen = new Set(qualifiedCells(window));
  return older.filter((entry) => {
    const unseen = qualifiedCells([entry]).filter((cell) => !seen.has(cell));
    for (const cell of unseen) seen.add(cell);
    return unseen.length > 0;
  });
}
