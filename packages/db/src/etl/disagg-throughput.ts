/**
 * Disaggregated rows report input throughput per prefill chip and output
 * throughput per decode chip; `tput_per_gpu` stays per chip overall. The
 * fixed-sequence producer already writes that basis. The agentic producer divides
 * all three rates by the total chip count, so its disaggregated rows are rescaled
 * here at ingest and by the agentic disaggregated throughput backfill. The rescale
 * is non-destructive: the producer's per-total values move to
 * `input_tput_per_total_gpu` and `output_tput_per_total_gpu`.
 */

/**
 * A per-total row's input and output rates sum to `tput_per_gpu`. After the
 * rescale they sum to at least `1 + min(p, d) / max(p, d)` times it, so this
 * tolerance only matches rows that have not been rescaled yet.
 */
const PER_TOTAL_SUM_TOLERANCE = 1e-3;

export interface PerPoolThroughputPatch {
  input_tput_per_gpu: number;
  output_tput_per_gpu: number;
  /** The producer's original per-total-chip input rate. */
  input_tput_per_total_gpu: number;
  /** The producer's original per-total-chip output rate. */
  output_tput_per_total_gpu: number;
}

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function nonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Returns the per-pool input and output rates for a disaggregated row whose rates
 * are still per total chip, plus the original rates under their per-total keys.
 * Returns null when the row was already rescaled, is per pool, or lacks the values
 * needed to tell.
 */
export function perPoolThroughputPatch(
  metrics: Readonly<Record<string, unknown>>,
  numPrefillGpu: number,
  numDecodeGpu: number,
): PerPoolThroughputPatch | null {
  if (!positive(numPrefillGpu) || !positive(numDecodeGpu)) return null;
  if ('input_tput_per_total_gpu' in metrics || 'output_tput_per_total_gpu' in metrics) return null;
  const total = metrics.tput_per_gpu;
  const input = metrics.input_tput_per_gpu;
  const output = metrics.output_tput_per_gpu;
  if (!positive(total) || !nonNegative(input) || !nonNegative(output)) return null;
  if (Math.abs((input + output) / total - 1) > PER_TOTAL_SUM_TOLERANCE) return null;

  const chips = numPrefillGpu + numDecodeGpu;
  return {
    input_tput_per_gpu: (input * chips) / numPrefillGpu,
    output_tput_per_gpu: (output * chips) / numDecodeGpu,
    input_tput_per_total_gpu: input,
    output_tput_per_total_gpu: output,
  };
}
