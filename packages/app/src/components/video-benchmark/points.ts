import { deploymentKey } from './deployment';
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
    replicas: num(o.replicas),
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
 * Newest published observation per (hardware, deployment, concurrency) cell.
 * Points arrive newest publication first, so the first occurrence wins; hardware
 * without a registry key is kept as-is because nothing can be compared against
 * it. Two server layouts of one hardware are different cells, so a GPUs-per-video
 * sweep adds points instead of replacing the existing one.
 */
export function latestVideoCells(points: VideoPoint[]): VideoPoint[] {
  const seen = new Set<string>();
  return points.filter((point) => {
    if (point.hardwareKey === null) return true;
    const key = `${point.hardwareKey}:${deploymentKey(point)}:${point.concurrency ?? 'na'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Valid clips a cell needs before the dashboard counts it: the same floor as the P90 display. */
export const DASHBOARD_SAMPLE_FLOOR = 10;

/** Generation settings plus model: the first five label parts, before seeds and prompt text. */
export function workloadGroup(point: Pick<VideoPoint, 'workload'>): string {
  return point.workload.split(' · ').slice(0, 5).join(' · ');
}

/**
 * Cells the dashboard reads. Published history also carries smoke runs (a few
 * clips of a shorter plan) and superseded exports, while the chart, cards,
 * Compare and Evidence must all describe one frozen workload: drop cells under
 * the sample floor, keep the workload measured on the most hardware (ties: more
 * cells, then the newer publication), then the newest cell per deployment and
 * concurrency. Everything else stays visible in the Performance history list.
 */
export function dashboardCells(points: VideoPoint[]): {
  cells: VideoPoint[];
  workload: string | null;
  otherWorkloads: number;
} {
  const qualified = points.filter((p) => p.samples >= DASHBOARD_SAMPLE_FLOOR);
  const hardware = new Map<string, Set<string>>();
  const cellKeys = new Map<string, Set<string>>();
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
  }
  let workload: string | null = null;
  for (const group of hardware.keys()) {
    if (workload === null) {
      workload = group;
      continue;
    }
    const byHardware = hardware.get(group)!.size - hardware.get(workload)!.size;
    if (
      byHardware > 0 ||
      (byHardware === 0 && cellKeys.get(group)!.size > cellKeys.get(workload)!.size)
    )
      workload = group;
  }
  const others = new Set(points.map(workloadGroup));
  if (workload !== null) others.delete(workload);
  return {
    cells:
      workload === null
        ? []
        : latestVideoCells(qualified.filter((p) => workloadGroup(p) === workload)),
    workload,
    otherWorkloads: others.size,
  };
}
