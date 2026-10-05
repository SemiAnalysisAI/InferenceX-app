import { metricValue, type MetricOptions, type VideoPoint } from './metrics';

type Layout = Pick<VideoPoint, 'participating' | 'server' | 'replicas' | 'deployment'> &
  Partial<Pick<VideoPoint, 'runtime'>>;
type QueueingInput = Pick<VideoPoint, 'concurrency' | 'replicas' | 'deployment'>;

const positiveInteger = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n > 0;

/** A measured server configuration, independent of client concurrency. */
export function deploymentKey(p: Layout): string {
  const d = p.deployment;
  return JSON.stringify([
    p.runtime ?? null,
    p.participating,
    p.server?.tp ?? null,
    p.server?.ulysses ?? null,
    p.replicas ?? null,
    p.server?.attention ?? null,
    d?.gpusPerReplica ?? null,
    d?.ring ?? null,
    d?.cfg ?? null,
    d?.offload?.ditCpu ?? null,
    d?.offload?.ditLayerwise ?? null,
    d?.offload?.textEncoderCpu ?? null,
    d?.offload?.imageEncoderCpu ?? null,
    d?.offload?.vaeCpu ?? null,
    d?.encoderParallel ?? null,
    d?.batchSize ?? null,
    d?.maxBatchSize ?? null,
    d?.batchDelayMs ?? null,
    d?.scheduling ?? null,
    d?.engine ?? null,
    d?.precision ?? null,
    d?.acceleration ?? null,
    d?.generationKey ?? null,
  ]);
}

/**
 * Known canonical workloads include prompts, seeds and generation settings.
 * Additional generation/precision/acceleration changes remain separate until a
 * quality protocol explicitly establishes comparability. Runtime is a disclosed
 * comparison variable, not a claim of equivalent perceptual quality.
 */
export function comparisonCohortKey(p: VideoPoint): string | null {
  if (!p.workloadKey) return null;
  return JSON.stringify([
    p.workloadKey,
    p.model,
    p.deployment?.generationKey ?? null,
    p.deployment?.precision ?? null,
    p.deployment?.acceleration ?? null,
  ]);
}

/**
 * Legacy retained bundles ran a supervised batch-one endpoint. Only those
 * records keep the historical one-replica fallback. A modern scheduling record
 * requires recorded capacity: a configured dynamic maximum above one is not
 * evidence that the server actually batched those requests.
 */
export function queueingStatus(p: QueueingInput): 'queueing' | 'unqueued' | 'unknown' {
  if (p.deployment === null || p.deployment === undefined)
    return (p.concurrency ?? 1) > (p.replicas ?? 1) ? 'queueing' : 'unqueued';
  if (!positiveInteger(p.concurrency)) return 'unknown';
  if (p.concurrency === 1) return 'unqueued';
  if (!positiveInteger(p.replicas)) return 'unknown';
  if (p.concurrency <= p.replicas) return 'unqueued';
  const d = p.deployment;
  let batch: number | null = null;
  if (d.scheduling === 'fixed_batch' && positiveInteger(d.batchSize)) batch = d.batchSize;
  if (d.scheduling === 'dynamic' && d.maxBatchSize === 1) batch = 1;
  if (d.scheduling === 'batch_one') batch = 1;
  if (batch === null) return 'unknown';
  return p.concurrency > p.replicas * batch ? 'queueing' : 'unqueued';
}

export function isQueueing(p: QueueingInput): boolean {
  return queueingStatus(p) === 'queueing';
}

/** A hardware failure or unknown request capacity cannot enter performance rankings. */
export function deploymentEligible(p: VideoPoint): boolean {
  return p.hardwareHealth?.status !== 'fail' && queueingStatus(p) === 'unqueued';
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

/** Known workload and layout required for a measured evidence comparison. */
export function evidenceComparisonKey(p: VideoPoint): string | null {
  const layout = [p.participating, p.server?.tp, p.server?.ulysses, p.replicas ?? 1];
  if (!p.workloadKey || layout.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n <= 0))
    return null;
  // Attention backend remains an explicitly disclosed comparison variable in
  // the existing cross-hardware evidence panel; it still identifies chart deployments.
  return JSON.stringify([
    comparisonCohortKey(p),
    deploymentKey({
      ...p,
      runtime: '',
      server: p.server ? { ...p.server, attention: null } : null,
    }),
  ]);
}

/**
 * One C1 cell per hardware on the known workload and deployment layout that the
 * most hardware share (ties keep the first in cell order). Hardware without
 * that workload and layout is omitted.
 * Cells arrive in hardware order and stay in it.
 */
export function sharedLayoutCells<T extends VideoPoint>(cells: T[]): T[] {
  const deployments = cells.filter(
    (p) =>
      p.hardwareKey !== null &&
      p.concurrency === 1 &&
      deploymentEligible(p) &&
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
    if (p.hardwareKey !== hardwareKey || !deploymentEligible(p)) continue;
    const rate = metricValue(p, 'videosPerGpuHour', options) ?? Number.NEGATIVE_INFINITY;
    const faster = rate === bestRate && (p.p50 ?? Infinity) < (best?.p50 ?? Infinity);
    if (best === undefined || rate > bestRate || faster) {
      best = p;
      bestRate = rate;
    }
  }
  return best;
}
