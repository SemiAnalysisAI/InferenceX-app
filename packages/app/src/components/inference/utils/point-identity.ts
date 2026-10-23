import type { InferenceData } from '@/components/inference/types';

interface AgenticSpecIdentity {
  benchmark_type?: string;
  spec_decoding?: string;
}

export function agenticSpecDecodingKeySuffix(point: AgenticSpecIdentity): string {
  return point.benchmark_type === 'agentic_traces' ? `|spec-${point.spec_decoding || 'none'}` : '';
}

export function scatterPointConfigId(point: InferenceData): string {
  let key = `${point.hwKey}|${point.precision}|${point.tp}|${point.conc}|${point.decode_ep ?? 0}|${point.prefill_tp ?? 0}|${point.prefill_ep ?? 0}`;
  if (point.disagg) {
    key += `|disagg|${point.num_prefill_gpu ?? 0}|${point.num_decode_gpu ?? 0}`;
  }
  if (point.physicalChips !== undefined) key += `|chips-${point.physicalChips}`;
  if (point.dp !== undefined) key += `|dp-${point.dp}`;
  if (point.offload_mode) key += `|offload-${point.offload_mode}`;
  if (point.recipe_fingerprint) key += `|recipe-${point.recipe_fingerprint}`;
  key += agenticSpecDecodingKeySuffix(point);
  if (point.powerVariant) key += `|variant-${point.powerVariant.id}`;
  return key;
}

const SERIES_VARIANT_DELIMITER = '-v-';

export function scatterSeriesKey(
  point: Pick<InferenceData, 'hwKey' | 'precision' | 'powerVariant'>,
): string {
  const base = `${point.hwKey}_${point.precision}`;
  return point.powerVariant ? `${base}${SERIES_VARIANT_DELIMITER}${point.powerVariant.id}` : base;
}

export interface ScatterSeriesIdentity {
  hw: string;
  precision: string;
  variant: string | null;
}

export function parseScatterSeriesKey(key: string): ScatterSeriesIdentity {
  const delimiter = key.indexOf(SERIES_VARIANT_DELIMITER);
  const core = delimiter === -1 ? key : key.slice(0, delimiter);
  const variant = delimiter === -1 ? null : key.slice(delimiter + SERIES_VARIANT_DELIMITER.length);
  const parts = core.split('_');
  const precision = parts.pop() ?? '';
  return { hw: parts.join('_'), precision, variant };
}

export function scatterPointJoinId(point: InferenceData, distinguishDates: boolean): string {
  const configId = scatterPointConfigId(point);
  return distinguishDates && point.date ? `${configId}|date-${point.date}` : configId;
}
