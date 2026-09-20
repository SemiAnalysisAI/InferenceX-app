import { hardwareKey, hardwareSort } from './hardware';
import type { VideoHistoryObservation, VideoHistoryPage } from './history';
import type { VideoPoint } from './metrics';

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Flatten published history pages (newest publication first) into chartable
 * points. A source re-exported under a later artifact repeats its observation
 * ids; the first occurrence wins, which is the newest publication.
 */
export function videoPoints(pages: VideoHistoryPage[]): VideoPoint[] {
  const seen = new Set<string>();
  const points: VideoPoint[] = [];
  for (const page of pages)
    for (const entry of page.entries)
      for (const source of entry.sources) {
        if (source.kind !== 'observation') continue;
        for (const observation of source.observations) {
          if (seen.has(observation.id)) continue;
          seen.add(observation.id);
          points.push(toPoint(observation, entry.runId, entry.artifact.id, source.observedAt));
        }
      }
  return points.toSorted(
    (a, b) =>
      hardwareSort(a.hardwareKey ?? '') - hardwareSort(b.hardwareKey ?? '') ||
      (a.concurrency ?? 0) - (b.concurrency ?? 0),
  );
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
    id: o.id,
    runId,
    artifactId,
    cell: o.cell ?? null,
    hardwareKey: hardwareKey(o.hardware),
    hardwareName: o.hardware,
    runtime: o.runtime ?? '',
    model: o.model ?? '',
    workload: o.workload ?? '',
    concurrency: num(o.concurrency),
    participating: num(o.participating),
    allocated: num(o.allocated),
    valid: num(o.valid),
    completed: num(o.completed),
    scheduled: num(o.scheduled),
    failed: num(o.failed),
    samples: num(o.samples) ?? 0,
    p50: num(o.p50),
    p90: num(o.p90),
    wallSeconds: num(o.wallSeconds),
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
 * Newest published observation per (hardware, concurrency) cell. Points arrive
 * newest publication first, so the first occurrence wins; hardware without a
 * registry key is kept as-is because nothing can be compared against it.
 */
export function latestVideoCells(points: VideoPoint[]): VideoPoint[] {
  const seen = new Set<string>();
  return points.filter((point) => {
    if (point.hardwareKey === null) return true;
    const key = `${point.hardwareKey}:${point.concurrency ?? 'na'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
