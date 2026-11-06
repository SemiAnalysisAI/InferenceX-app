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

interface StoredBenchmarkRow {
  benchmark_type: string;
  disagg: boolean;
  num_prefill_gpu: number;
  num_decode_gpu: number;
  prefill_num_workers: number;
  decode_num_workers: number;
  metrics: Record<string, number>;
}

interface PoolFields {
  disagg?: boolean;
  num_prefill_gpu?: number;
  num_decode_gpu?: number;
  prefill_num_workers?: number;
  decode_num_workers?: number;
}

/**
 * Whether a disaggregated row records its real prefill and decode pool sizes:
 * worker counts are present, or the two pool fields differ. Mirrors `hasPoolSplit`
 * in the app (`packages/app/src/lib/benchmarks/chip-basis.ts`), which reads the
 * rescaled rows; the two must agree on which rows are per pool.
 */
export function hasRealPoolSplit(row: PoolFields): boolean {
  if (row.disagg !== true || !positive(row.num_prefill_gpu) || !positive(row.num_decode_gpu)) {
    return false;
  }
  return (
    (positive(row.prefill_num_workers) && positive(row.decode_num_workers)) ||
    row.num_prefill_gpu !== row.num_decode_gpu
  );
}

/**
 * Whether a row is one the agentic producer divided by every chip and that has
 * real pool sizes to rescale by. Rows that mirror the whole deployment into both
 * pool fields (single-node fallbacks) are left per total; rescaling them by N/N
 * would double the rates.
 */
export function isPerTotalAgenticCandidate(row: PoolFields & { benchmark_type?: string }): boolean {
  return row.benchmark_type === 'agentic_traces' && hasRealPoolSplit(row);
}

/**
 * Puts agentic disaggregated rows that predate the per-pool ingest on the per-pool
 * basis as they are read, exactly as the backfill would store them, so readers never
 * depend on the backfill having run (including public-DB copies, whose sync never
 * updates existing rows). Rows already rescaled are returned unchanged.
 */
export function withStoredPerPoolBasis<T extends StoredBenchmarkRow>(rows: T[]): T[] {
  return rows.map((row) => {
    if (!isPerTotalAgenticCandidate(row)) return row;
    const patch = perPoolThroughputPatch(row.metrics, row.num_prefill_gpu, row.num_decode_gpu);
    return patch ? { ...row, metrics: { ...row.metrics, ...patch } } : row;
  });
}
