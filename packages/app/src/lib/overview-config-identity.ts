import type { BenchmarkRow } from './api';

/**
 * Exact per-deployment identity for the overview grouping. Every dimension that
 * makes a serving configuration a distinct deployable topology is part of the
 * key — model, hardware, framework, precision, spec method, disagg, multinode,
 * per-role parallelism and worker counts, GPU counts, and offload mode. Rows
 * that differ only in concurrency, date, image, or run URL share one identity.
 *
 * Serialized as a JSON tuple so no field delimiter can collide with a value.
 */
export function overviewConfigIdentityKey(row: BenchmarkRow): string {
  return JSON.stringify([
    row.model,
    row.hardware,
    row.framework,
    row.precision,
    row.spec_method,
    row.disagg,
    row.is_multinode,
    row.prefill_tp,
    row.prefill_ep,
    row.prefill_dp_attention,
    row.prefill_num_workers,
    row.decode_tp,
    row.decode_ep,
    row.decode_dp_attention,
    row.decode_num_workers,
    row.num_prefill_gpu,
    row.num_decode_gpu,
    row.offload_mode ?? 'off',
  ]);
}
