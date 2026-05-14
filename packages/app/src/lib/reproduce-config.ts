import type { InferenceData } from '@/components/inference/types';

/**
 * Allow-list of config / identity / provenance fields surfaced in the
 * Reproduce drawer's "Config JSON" tab.
 *
 * The previous implementation subtractively destructured chart-derived
 * presentational fields off the point and stringified the rest, which left
 * every raw `metrics` value (TTFT / TPOT / ITL / E2EL / INTVTY percentiles
 * plus throughput) mixed in alongside the launch config. Those are *results*,
 * not inputs — copying them back as a "future config diff" is meaningless.
 *
 * Order is significant: `JSON.stringify` preserves insertion order for
 * string keys, so a fixed array order makes the output stable and
 * diff-friendly across runs.
 */
export const CONFIG_JSON_KEYS = [
  'model',
  'framework',
  'precision',
  'hw',
  'hwKey',
  'tp',
  'ep',
  'dp_attention',
  'disagg',
  'is_multinode',
  'prefill_tp',
  'prefill_ep',
  'prefill_dp_attention',
  'prefill_num_workers',
  'decode_tp',
  'decode_ep',
  'decode_dp_attention',
  'decode_num_workers',
  'num_prefill_gpu',
  'num_decode_gpu',
  'spec_decoding',
  'conc',
  'image',
  'date',
  'actualDate',
  'run_url',
] as const satisfies readonly (keyof InferenceData)[];

/**
 * Build the JSON-serializable config object for a point. Pure function so it
 * is unit-testable and reusable for a future "diff between runs of the same
 * config" feature.
 *
 * `sequence` is an optional second argument because `isl` / `osl` are not
 * stored on the chart point — they live on the active sequence selection.
 * Including them in the output keeps the JSON a complete description of
 * "what was run".
 */
export function buildReproduceConfig(
  point: InferenceData,
  sequence?: { isl: number; osl: number },
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of CONFIG_JSON_KEYS) {
    const value = point[key];
    if (value === undefined || value === null) continue;
    if (key === 'conc' && sequence) {
      out.isl = sequence.isl;
      out.osl = sequence.osl;
    }
    out[key] = value;
  }
  if (sequence && !('isl' in out)) {
    out.isl = sequence.isl;
    out.osl = sequence.osl;
  }
  return out;
}
