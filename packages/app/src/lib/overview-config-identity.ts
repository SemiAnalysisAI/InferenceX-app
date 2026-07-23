import type { BenchmarkRow } from './api';

/** Every dimension that makes a distinct deployable topology; rows differing
 *  only in concurrency, date, image, or run URL share one identity. A JSON
 *  tuple so no delimiter can collide with a value. */
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
