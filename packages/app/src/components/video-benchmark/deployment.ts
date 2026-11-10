import { engineSort } from './engines';
import { hardwareSort } from './hardware';
import { metricValue, type MetricOptions, type VideoPoint } from './metrics';
import { isLossy, optimizationsOf } from './optimizations';

type Layout = Pick<VideoPoint, 'participating' | 'server' | 'replicas'>;
type Deployment = Pick<VideoPoint, 'participating' | 'server' | 'results'>;
type HardwareDeployment = Deployment & Pick<VideoPoint, 'hardwareKey'>;

/** "sglang", or "sol-engine+first-block-cache+sol-attn" when the run declared optimizations. */
export function runtimeKey(p: Pick<VideoPoint, 'results'>): string {
  return [p.results?.engine ?? 'na', ...optimizationsOf(p)].join('+');
}

/**
 * A deployment is the serving runtime and server layout that produced a cell:
 * which engine served with which optimizations, how many GPU boards served one
 * request and how they split the model (tensor parallel × Ulysses sequence
 * parallel). Cells that differ only in client concurrency belong to the same
 * deployment, so they share this key. Two engines, or one engine with and
 * without an optimization, are never one deployment, so neither replaces the
 * other's cell.
 */
export function deploymentKey(p: Deployment): string {
  return `${runtimeKey(p)}:${p.participating ?? 'na'}g:tp${p.server?.tp ?? 'na'}:u${p.server?.ulysses ?? 'na'}`;
}

/** One hardware deployment: the unit Chip Config compares across runs. */
export const chipConfigKey = (p: HardwareDeployment) => `${p.hardwareKey}:${deploymentKey(p)}`;

/** Deployment display order: hardware, then engine, then participating GPUs. */
export const compareDeployments = (a: HardwareDeployment, b: HardwareDeployment): number =>
  hardwareSort(a.hardwareKey ?? '') - hardwareSort(b.hardwareKey ?? '') ||
  engineSort(a.results?.engine ?? null) - engineSort(b.results?.engine ?? null) ||
  (a.participating ?? 0) - (b.participating ?? 0);

/**
 * On a batch-one server every request beyond one per replica waits in a queue:
 * latency grows with concurrency while throughput stays flat. Such a cell is
 * evidence about the same deployment, never a new point on its frontier.
 * Bundles that predate the deployment record ran one supervised endpoint, so
 * an unknown replica count reads as one.
 */
export function isQueueing(p: Pick<VideoPoint, 'concurrency' | 'replicas'>): boolean {
  return (p.concurrency ?? 1) > (p.replicas ?? 1);
}

/** "TP2 × Ulysses 2"; null unless both splits were recorded. */
export function serverSplit(p: Pick<VideoPoint, 'server'>): string | null {
  const tp = p.server?.tp ?? null;
  const ulysses = p.server?.ulysses ?? null;
  return tp !== null && ulysses !== null ? `TP${tp} × Ulysses ${ulysses}` : null;
}

/** "4 GPU · TP2 × Ulysses 2", plus the replica count when more than one. */
export function layoutLabel(p: Layout, locale: 'en' | 'zh'): string {
  const parts: string[] = [];
  if (p.participating !== null)
    parts.push(locale === 'zh' ? `${p.participating} 张 GPU` : `${p.participating} GPU`);
  const split = serverSplit(p);
  if (split !== null) parts.push(split);
  if (p.replicas !== null && p.replicas > 1)
    parts.push(locale === 'zh' ? `${p.replicas} 个副本` : `${p.replicas} replicas`);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

/** Workload and server layout; null while the workload or any layout part is unrecorded. */
function workloadLayout(p: VideoPoint): unknown[] | null {
  const layout = [p.participating, p.server?.tp, p.server?.ulysses, p.replicas ?? 1];
  if (!p.workloadKey || layout.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n <= 0))
    return null;
  return [p.workloadKey, ...layout];
}

/** Known workload, runtime and layout required for a measured evidence comparison. */
export function evidenceComparisonKey(p: VideoPoint): string | null {
  const known = workloadLayout(p);
  return known && JSON.stringify([runtimeKey(p), ...known]);
}

/** Run, hardware, engine, workload and layout: everything but the optimizations. */
function twinKey(p: VideoPoint): string | null {
  const known = workloadLayout(p);
  return known && JSON.stringify([p.runId, p.hardwareKey, p.results?.engine ?? null, ...known]);
}

/**
 * The lossless cell a lossy cell is compared with: same run, hardware, engine, workload, GPU
 * count and server layout, with no lossy optimization. A cell from another run, workload or
 * layout differs in more than the optimization, so it never pairs. The same concurrency comes first, then
 * a cell whose optimizations the lossy cell also declares.
 */
export function losslessTwin<T extends VideoPoint>(
  lossy: VideoPoint,
  pool: readonly T[],
): T | null {
  const key = twinKey(lossy);
  if (key === null || !isLossy(lossy)) return null;
  const declared = optimizationsOf(lossy);
  const rank = (p: T) =>
    Number(p.concurrency !== lossy.concurrency) * 2 +
    Number(!optimizationsOf(p).every((name) => declared.includes(name)));
  let best: T | null = null;
  for (const p of pool)
    if (!isLossy(p) && twinKey(p) === key && (best === null || rank(p) < rank(best))) best = p;
  return best;
}

/**
 * One lossless C1 cell per hardware on the known workload, runtime and deployment
 * layout that the most hardware share (ties keep the first in cell order), so a
 * cross-hardware comparison holds the runtime constant. Hardware without that
 * workload, runtime and layout is omitted.
 * Cells arrive in hardware order and stay in it.
 */
export function sharedLayoutCells<T extends VideoPoint>(cells: T[]): T[] {
  const deployments = cells.filter(
    (p) =>
      p.hardwareKey !== null &&
      p.concurrency === 1 &&
      !isLossy(p) &&
      evidenceComparisonKey(p) !== null,
  );
  const hardwareByLayout = new Map<string, Set<string>>();
  for (const p of deployments) {
    const key = evidenceComparisonKey(p)!;
    const set = hardwareByLayout.get(key) ?? new Set<string>();
    set.add(p.hardwareKey!);
    hardwareByLayout.set(key, set);
  }
  let shared: string | null = null;
  for (const [key, set] of hardwareByLayout)
    if (shared === null || set.size > hardwareByLayout.get(shared)!.size) shared = key;
  const keys = [...new Set(deployments.map((p) => p.hardwareKey!))];
  return keys.flatMap((hardwareKey) => {
    const cell = deployments.find(
      (p) => p.hardwareKey === hardwareKey && evidenceComparisonKey(p) === shared,
    );
    return cell ? [cell] : [];
  });
}

/**
 * The cell that stands for a hardware in cards and comparisons: its most
 * efficient deployment (highest videos per participating
 * GPU-hour), lowest P50 on ties. Queued cells never lead, and lossy cells lead
 * only when `lossy` admits them, so by default a hardware with only lossy cells
 * has no lead; one whose cells all lack the rate falls back to its first such
 * deployment cell.
 */
export function leadCell(
  cells: VideoPoint[],
  hardwareKey: string,
  options: MetricOptions,
  { lossy = false }: { lossy?: boolean } = {},
): VideoPoint | undefined {
  let best: VideoPoint | undefined;
  let bestRate = Number.NEGATIVE_INFINITY;
  for (const p of cells) {
    if (p.hardwareKey !== hardwareKey || isQueueing(p) || (!lossy && isLossy(p))) continue;
    const rate = metricValue(p, 'videosPerGpuHour', options) ?? Number.NEGATIVE_INFINITY;
    const faster = rate === bestRate && (p.p50 ?? Infinity) < (best?.p50 ?? Infinity);
    if (best === undefined || rate > bestRate || faster) {
      best = p;
      bestRate = rate;
    }
  }
  return best;
}
