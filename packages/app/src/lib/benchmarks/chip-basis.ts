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
  prefill_num_workers?: number;
  decode_num_workers?: number;
  num_prefill_gpu?: number;
  num_decode_gpu?: number;
}

function chipCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Multipliers that take per-pool input and output rates to per-total-chip rates,
 * or null for rows the basis does not change: aggregated rows, and rows without a
 * real prefill/decode split. Legacy Dynamo rows (Oct–Nov 2025) carry
 * `disagg: true` with no workers and both pool sizes set to the full deployment;
 * their rates are already per total chip.
 */
export function totalChipFactors(row: ChipCounts): { input: number; output: number } | null {
  if (!row.disagg) return null;
  if (!chipCount(row.prefill_num_workers) || !chipCount(row.decode_num_workers)) return null;
  const prefill = row.num_prefill_gpu;
  const decode = row.num_decode_gpu;
  if (!chipCount(prefill) || !chipCount(decode)) return null;
  const chips = prefill + decode;
  return { input: prefill / chips, output: decode / chips };
}

function scaleRate(value: number | undefined, factor: number | undefined): number | undefined {
  return typeof value === 'number' && factor !== undefined ? value * factor : value;
}

type RateRow = ChipCounts & {
  input_tput_per_gpu?: number;
  output_tput_per_gpu?: number;
  chip_basis?: ChipBasis;
};

/**
 * Input and output throughput per deployment chip, whatever basis the row is on,
 * so they add up with `tput_per_gpu`. Use this for anything that must not move
 * with the chip-basis toggle, such as the measured input/output token mix.
 */
export function perTotalChipRates(row: RateRow): { input?: number; output?: number } {
  const factors = row.chip_basis === 'total' ? null : totalChipFactors(row);
  return {
    input: scaleRate(row.input_tput_per_gpu, factors?.input),
    output: scaleRate(row.output_tput_per_gpu, factors?.output),
  };
}

/** Per-total-chip input throughput, so it adds up with `tput_per_gpu`. */
export function inputTputPerTotalChip(row: RateRow): number | undefined {
  return perTotalChipRates(row).input;
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

/**
 * Y-axis metrics whose value divides input or output throughput, so they change
 * with the chip basis. Every other metric is identical under both bases.
 */
export const CHIP_BASIS_METRICS: ReadonlySet<string> = new Set([
  'y_inputTputPerGpu',
  'y_outputTputPerGpu',
  'y_costhi',
  'y_costri',
  'y_costhOutput',
  'y_costrOutput',
  'y_inputTokensPerDollarH',
  'y_inputTokensPerDollarR',
  'y_outputTokensPerDollarH',
  'y_outputTokensPerDollarR',
  'y_inputTputPerMw',
  'y_outputTputPerMw',
  'y_jInput',
  'y_jOutput',
]);

/** Appends the total-chip qualifier to a metric label or title. */
export function withTotalChipQualifier(text: unknown, locale: 'en' | 'zh'): string | undefined {
  if (typeof text !== 'string') return undefined;
  return locale === 'zh' ? `${text}（按芯片总数）` : `${text} (All Chips)`;
}
