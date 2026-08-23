import type { InferenceData } from '@/components/inference/types';

interface AgenticSpecIdentity {
  benchmark_type?: string;
  spec_decoding?: string;
}

/** Point-level identity suffix for decode methods merged into one agentic curve. */
export function agenticSpecDecodingKeySuffix(point: AgenticSpecIdentity): string {
  return point.benchmark_type === 'agentic_traces' ? `|spec-${point.spec_decoding || 'none'}` : '';
}

/** Stable D3 join key for one scatter point within a chart series. */
export function scatterPointConfigId(point: InferenceData): string {
  let key = `${point.hwKey}|${point.precision}|${point.tp}|${point.conc}|${point.decode_ep ?? 0}|${point.prefill_tp ?? 0}|${point.prefill_ep ?? 0}`;
  if (point.disagg) {
    key += `|disagg|${point.num_prefill_gpu ?? 0}|${point.num_decode_gpu ?? 0}`;
  }
  if (point.offload_mode) key += `|offload-${point.offload_mode}`;
  if (point.recipe_fingerprint) key += `|recipe-${point.recipe_fingerprint}`;
  // Agentic series omit spec decoding from hwKey so one curve can mix methods.
  // It remains point identity to avoid collapsing overlapping MTP/STP results.
  key += agenticSpecDecodingKeySuffix(point);
  return key;
}

/**
 * Stable D3 join key for an official scatter point.
 *
 * Date only participates when a chart is simultaneously rendering multiple
 * date series. This preserves the long-lived identity of current-run points
 * while preventing otherwise-identical comparison points from sharing a key.
 */
export function scatterPointJoinId(point: InferenceData, distinguishDates: boolean): string {
  const configId = scatterPointConfigId(point);
  return distinguishDates && point.date ? `${configId}|date-${point.date}` : configId;
}
