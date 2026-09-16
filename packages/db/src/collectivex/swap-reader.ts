import type { CollectiveXPercentiles, CollectiveXSwapPoint, CollectiveXSwapResult } from './types';

/** The standalone harness writes an execution matrix without EP case metadata. */
export function isSwapMatrix(value: unknown): boolean {
  const matrix = value as {
    version?: unknown;
    include?: { backend?: unknown; sku?: unknown }[];
  } | null;
  return (
    matrix?.version === undefined &&
    Array.isArray(matrix?.include) &&
    matrix.include.length === 1 &&
    matrix.include[0]?.backend === 'swap-blocks' &&
    typeof matrix.include[0]?.sku === 'string'
  );
}

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
function positiveInt(value: unknown): value is number {
  return positive(value) && Number.isSafeInteger(value);
}
function percentiles(value: unknown): value is CollectiveXPercentiles {
  const p = value as CollectiveXPercentiles | null;
  return (
    p !== null &&
    p !== undefined &&
    [p.p50, p.p90, p.p95, p.p99].every(positive) &&
    p.p50 <= p.p90 &&
    p.p90 <= p.p95 &&
    p.p95 <= p.p99
  );
}

/** Validate measured values before any chart/summary can call a result successful. */
export function readSwapResults(
  matrix: unknown,
  docs: unknown[],
  sourceSha: string,
): CollectiveXSwapResult[] {
  if (!isSwapMatrix(matrix)) return [];
  const sku = (matrix as { include: { sku: string }[] }).include[0].sku;
  const seen = new Set<string>();
  return docs.flatMap((doc) => {
    const raw = doc as {
      schema?: string;
      operation?: string;
      timing?: string;
      warmup: number;
      iterations: number;
      runtime: CollectiveXSwapResult['runtime'];
      selection?: { max_payload_bytes: number; skipped_cases: unknown[] };
      cases: (Omit<
        CollectiveXSwapPoint,
        'sample_count' | 'latency_us' | 'payload_gbps_at_latency_percentile'
      > & {
        correctness_passed: boolean;
        latency: { sample_count: number; percentiles_us: CollectiveXPercentiles };
      })[];
    } | null;
    if (raw?.schema !== 'collectivex-swap-blocks-v1') return [];
    if (
      raw.operation !== 'vllm._custom_ops.swap_blocks' ||
      raw.timing !== 'drained-wall-clock-including-submission-and-synchronization' ||
      !Array.isArray(raw.cases) ||
      raw.cases.length === 0 ||
      !positiveInt(raw.iterations) ||
      !Number.isSafeInteger(raw.warmup) ||
      raw.warmup < 0 ||
      !raw.runtime ||
      raw.runtime.source_sha !== sourceSha ||
      !['device', 'torch', 'vllm', 'image'].every(
        (key) => typeof raw.runtime[key as keyof typeof raw.runtime] === 'string',
      )
    ) {
      throw new TypeError('invalid swap_blocks artifact or provenance');
    }
    const points = raw.cases.map((row): CollectiveXSwapPoint => {
      const key = JSON.stringify([
        row.direction,
        row.layout,
        row.block_bytes,
        row.num_blocks,
        row.seed,
      ]);
      if (
        !['h2d', 'd2h', 'd2d'].includes(row.direction) ||
        !['contiguous', 'random'].includes(row.layout) ||
        !positiveInt(row.block_bytes) ||
        !positiveInt(row.num_blocks) ||
        !positiveInt(row.payload_bytes) ||
        row.payload_bytes !== row.block_bytes * row.num_blocks ||
        row.correctness_passed !== true ||
        !Number.isSafeInteger(row.seed) ||
        !percentiles(row.latency?.percentiles_us) ||
        row.latency.sample_count !== raw.iterations ||
        seen.has(key)
      ) {
        throw new TypeError('invalid or duplicate swap_blocks measurement');
      }
      seen.add(key);
      const p = row.latency.percentiles_us;
      // Count copied payload once, including d2d; this is host-observed goodput.
      const rate = (us: number) => row.payload_bytes / us / 1000;
      return {
        direction: row.direction,
        layout: row.layout,
        block_bytes: row.block_bytes,
        num_blocks: row.num_blocks,
        payload_bytes: row.payload_bytes,
        seed: row.seed,
        host_memory: row.host_memory,
        api: row.api,
        sample_count: row.latency.sample_count,
        latency_us: p,
        payload_gbps_at_latency_percentile: {
          p50: rate(p.p50),
          p90: rate(p.p90),
          p95: rate(p.p95),
          p99: rate(p.p99),
        },
      };
    });
    return [
      {
        result_id: `swap-${points[0].layout}-${points[0].seed}`,
        sku,
        runtime: raw.runtime,
        timing: raw.timing,
        warmup: raw.warmup,
        iterations: raw.iterations,
        max_payload_bytes: raw.selection?.max_payload_bytes ?? null,
        skipped_points: raw.selection?.skipped_cases?.length ?? 0,
        points,
      },
    ];
  });
}
