import { metricValue, type MetricOptions, type VideoPoint } from './metrics';

type Layout = Pick<VideoPoint, 'participating' | 'server' | 'replicas'>;

/**
 * A deployment is the server layout that produced a cell: how many GPU boards
 * served one request and how they split the model (tensor parallel × Ulysses
 * sequence parallel). Cells that differ only in client concurrency belong to
 * the same deployment, so they share this key.
 */
export function deploymentKey(p: Pick<VideoPoint, 'participating' | 'server'>): string {
  return `${p.participating ?? 'na'}g:tp${p.server?.tp ?? 'na'}:u${p.server?.ulysses ?? 'na'}`;
}

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

/** "4 GPU · TP2 × Ulysses 2", plus the replica count when more than one. */
export function layoutLabel(p: Layout, locale: 'en' | 'zh'): string {
  const parts: string[] = [];
  if (p.participating !== null)
    parts.push(locale === 'zh' ? `${p.participating} 张 GPU` : `${p.participating} GPU`);
  const tp = p.server?.tp ?? null;
  const ulysses = p.server?.ulysses ?? null;
  if (tp !== null && ulysses !== null) parts.push(`TP${tp} × Ulysses ${ulysses}`);
  if (p.replicas !== null && p.replicas > 1)
    parts.push(locale === 'zh' ? `${p.replicas} 个副本` : `${p.replicas} replicas`);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

/**
 * One non-queued cell per hardware on the deployment layout that the most
 * hardware share (ties keep the first layout in cell order), so cross-hardware
 * evidence compares like with like. A hardware without that layout falls back
 * to its lead cell. Cells arrive in hardware order and stay in it.
 */
export function sharedLayoutCells<T extends VideoPoint>(cells: T[]): T[] {
  const deployments = cells.filter((p) => p.hardwareKey !== null && !isQueueing(p));
  const hardwareByLayout = new Map<string, Set<string>>();
  for (const p of deployments) {
    const set = hardwareByLayout.get(deploymentKey(p)) ?? new Set<string>();
    set.add(p.hardwareKey!);
    hardwareByLayout.set(deploymentKey(p), set);
  }
  let shared: string | null = null;
  for (const [key, set] of hardwareByLayout)
    if (shared === null || set.size > hardwareByLayout.get(shared)!.size) shared = key;
  const keys = [...new Set(deployments.map((p) => p.hardwareKey!))];
  return keys.flatMap((hardwareKey) => {
    const cell =
      deployments.find((p) => p.hardwareKey === hardwareKey && deploymentKey(p) === shared) ??
      leadCell(deployments, hardwareKey, { tier: 'h' });
    return cell ? [cell as T] : [];
  });
}

/**
 * The cell that stands for a hardware in cards and comparisons: its most
 * efficient deployment under the current GPU basis (highest videos per
 * GPU-hour), lowest P50 on ties. Queued cells never lead; a hardware whose
 * cells all lack the rate falls back to its first deployment cell.
 */
export function leadCell(
  cells: VideoPoint[],
  hardwareKey: string,
  options: MetricOptions,
): VideoPoint | undefined {
  let best: VideoPoint | undefined;
  let bestRate = Number.NEGATIVE_INFINITY;
  for (const p of cells) {
    if (p.hardwareKey !== hardwareKey || isQueueing(p)) continue;
    const rate = metricValue(p, 'videosPerGpuHour', options) ?? Number.NEGATIVE_INFINITY;
    const faster = rate === bestRate && (p.p50 ?? Infinity) < (best?.p50 ?? Infinity);
    if (best === undefined || rate > bestRate || faster) {
      best = p;
      bestRate = rate;
    }
  }
  return best;
}
