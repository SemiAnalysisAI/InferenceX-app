import type { InferenceData } from '@/components/inference/types';

/** Stable D3 join key for one scatter point within a chart series. */
export function scatterPointConfigId(point: InferenceData): string {
  let key = `${point.hwKey}|${point.precision}|${point.tp}|${point.conc}|${point.decode_ep ?? 0}|${point.prefill_tp ?? 0}|${point.prefill_ep ?? 0}`;
  if (point.disagg) {
    key += `|disagg|${point.num_prefill_gpu ?? 0}|${point.num_decode_gpu ?? 0}`;
  }
  if (point.offload_mode) key += `|offload-${point.offload_mode}`;
  // Agentic series omit spec decoding from hwKey so one curve can mix methods.
  // It remains point identity to avoid collapsing overlapping MTP/STP results.
  if (point.benchmark_type === 'agentic_traces') {
    key += `|spec-${point.spec_decoding ?? 'none'}`;
  }
  return key;
}
