import type { BenchmarkRow } from '@/lib/api/api';

/**
 * Which chips divide a disaggregated config's input and output throughput.
 *
 * `pool` is the stored basis: input tokens per prefill chip and output tokens per
 * decode chip. `total` divides both by every chip in the deployment, the basis
 * `tput_per_gpu` and aggregated configs always use. Aggregated rows are identical
 * under both.
 */
export type ChipBasis = 'pool' | 'total';

export const DEFAULT_CHIP_BASIS: ChipBasis = 'pool';

/** A benchmark row that may carry rescaled per-total-chip rates. */
export type ChipBasisRow<T extends BenchmarkRow = BenchmarkRow> = T & { chip_basis?: ChipBasis };

interface ChipCounts {
  disagg?: boolean;
  num_prefill_gpu?: number;
  num_decode_gpu?: number;
}

function chipCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Multipliers that take per-pool input and output rates to per-total-chip rates,
 * or null for rows the basis does not change (aggregated rows and rows without
 * both pool sizes).
 */
export function totalChipFactors(row: ChipCounts): { input: number; output: number } | null {
  if (!row.disagg) return null;
  const prefill = row.num_prefill_gpu;
  const decode = row.num_decode_gpu;
  if (!chipCount(prefill) || !chipCount(decode)) return null;
  const chips = prefill + decode;
  return { input: prefill / chips, output: decode / chips };
}

/** Per-total-chip input throughput for a per-pool row, so it adds up with `tput_per_gpu`. */
export function inputTputPerTotalChip(
  row: ChipCounts & { input_tput_per_gpu?: number; chip_basis?: ChipBasis },
): number | undefined {
  const input = row.input_tput_per_gpu;
  if (typeof input !== 'number' || row.chip_basis === 'total') return input;
  const factors = totalChipFactors(row);
  return factors ? input * factors.input : input;
}

/**
 * Returns the row on the requested basis. Per-pool rows come back unchanged;
 * total-chip rows get a rescaled copy of their metrics and `chip_basis: 'total'`
 * so downstream maths that needs the pool sizes (power basis, uncached token
 * basis) can tell which denominator it is reading.
 */
export function withChipBasis<T extends BenchmarkRow>(
  row: ChipBasisRow<T>,
  basis: ChipBasis,
): ChipBasisRow<T> {
  if (basis === 'pool' || row.chip_basis === 'total') return row;
  const factors = totalChipFactors(row);
  if (!factors) return row;
  const metrics = { ...row.metrics };
  if (typeof metrics.input_tput_per_gpu === 'number') {
    metrics.input_tput_per_gpu *= factors.input;
  }
  if (typeof metrics.output_tput_per_gpu === 'number') {
    metrics.output_tput_per_gpu *= factors.output;
  }
  return { ...row, metrics, chip_basis: 'total' };
}

export function rowsWithChipBasis<T extends BenchmarkRow>(
  rows: T[],
  basis: ChipBasis,
): ChipBasisRow<T>[] {
  return basis === 'pool' ? rows : rows.map((row) => withChipBasis(row, basis));
}
