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
  if (point.physicalChips !== undefined) key += `|chips-${point.physicalChips}`;
  if (point.dp !== undefined) key += `|dp-${point.dp}`;
  if (point.offload_mode) key += `|offload-${point.offload_mode}`;
  if (point.recipe_fingerprint) key += `|recipe-${point.recipe_fingerprint}`;
  // Agentic series omit spec decoding from hwKey so one curve can mix methods.
  // It remains point identity to avoid collapsing overlapping MTP/STP results.
  key += agenticSpecDecodingKeySuffix(point);
  // Comparison clones share every config field with their base point.
  if (point.powerVariant) key += `|variant-${point.powerVariant.id}`;
  return key;
}

/**
 * Comparison-series suffix inside a scatter series key. Letters, digits and
 * dashes only, so the key stays a valid CSS class token (the perf ruler and
 * `i_rulers` address rooflines by class) and needs no escaping.
 */
const SERIES_VARIANT_DELIMITER = '-v-';

/**
 * Identity of one drawn series: hardware key, precision and, on a power
 * comparison, the boundary or role variant. Rooflines, frontiers, line labels
 * and the perf ruler all key on this string.
 */
export function scatterSeriesKey(
  point: Pick<InferenceData, 'hwKey' | 'precision' | 'powerVariant'>,
): string {
  const base = `${point.hwKey}_${point.precision}`;
  return point.powerVariant ? `${base}${SERIES_VARIANT_DELIMITER}${point.powerVariant.id}` : base;
}

export interface ScatterSeriesIdentity {
  hw: string;
  precision: string;
  /** Comparison variant id (`gpu-provisioned`, `prefill`, …) or null for the base series. */
  variant: string | null;
}

/** Inverse of `scatterSeriesKey`; hardware keys may themselves contain underscores. */
export function parseScatterSeriesKey(key: string): ScatterSeriesIdentity {
  const delimiter = key.indexOf(SERIES_VARIANT_DELIMITER);
  const core = delimiter === -1 ? key : key.slice(0, delimiter);
  const variant = delimiter === -1 ? null : key.slice(delimiter + SERIES_VARIANT_DELIMITER.length);
  const parts = core.split('_');
  const precision = parts.pop() ?? '';
  return { hw: parts.join('_'), precision, variant };
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
