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

/** Whether a disaggregated row records its real prefill and decode pool sizes. */
export function hasPoolSplit(row: ChipCounts): boolean {
  return (
    row.disagg === true &&
    chipCount(row.prefill_num_workers) &&
    chipCount(row.decode_num_workers) &&
    chipCount(row.num_prefill_gpu) &&
    chipCount(row.num_decode_gpu)
  );
}

/**
 * Legacy Dynamo rows (Oct–Nov 2025) carry `disagg: true` with no workers and both
 * pool sizes set to the whole deployment N. Their rates are still per pool (input
 * per prefill chip, output per decode chip), but the real pool sizes were never
 * stored, so they convert through the token mix instead of the pool sizes.
 */
function isUnsplitDisagg(row: ChipCounts): boolean {
  return row.disagg === true && !hasPoolSplit(row);
}

/** Every chip in a disaggregated deployment, or undefined when unknown. */
export function disaggDeploymentChips(row: ChipCounts): number | undefined {
  if (hasPoolSplit(row)) return row.num_prefill_gpu! + row.num_decode_gpu!;
  if (!isUnsplitDisagg(row)) return undefined;
  const chips = Math.max(row.num_prefill_gpu ?? 0, row.num_decode_gpu ?? 0);
  return chips > 0 ? chips : undefined;
}

/**
 * Multipliers that take per-pool input and output rates to per-total-chip rates,
 * or null for rows without a real prefill/decode split.
 */
export function totalChipFactors(row: ChipCounts): { input: number; output: number } | null {
  if (!hasPoolSplit(row)) return null;
  const chips = row.num_prefill_gpu! + row.num_decode_gpu!;
  return { input: row.num_prefill_gpu! / chips, output: row.num_decode_gpu! / chips };
}

function scaleRate(value: number | undefined, factor: number | undefined): number | undefined {
  return typeof value === 'number' && factor !== undefined ? value * factor : value;
}

type RateRow = ChipCounts & {
  tput_per_gpu?: number;
  input_tput_per_gpu?: number;
  output_tput_per_gpu?: number;
  isl?: number | null;
  osl?: number | null;
  chip_basis?: ChipBasis;
};

const RAW_SUM_TOLERANCE = 0.01;

/**
 * Input and output throughput per deployment chip, or null when a row's
 * denominator cannot be pinned down (an unsplit legacy row without ISL/OSL).
 * Rows split into pools rescale by the pool sizes; unsplit legacy rows, all
 * fixed-sequence, split `tput_per_gpu` by ISL:OSL, which every request shares;
 * rows whose raw rates already add up to `tput_per_gpu` are returned as they are.
 */
export function exactPerTotalChipRates(row: RateRow): { input?: number; output?: number } | null {
  const raw = { input: row.input_tput_per_gpu, output: row.output_tput_per_gpu };
  if (row.chip_basis === 'total' || !row.disagg) return raw;
  const factors = totalChipFactors(row);
  if (factors) {
    return {
      input: scaleRate(raw.input, factors.input),
      output: scaleRate(raw.output, factors.output),
    };
  }
  const total = row.tput_per_gpu;
  if (!(typeof total === 'number' && total > 0)) return null;
  const rawSum = (raw.input ?? 0) + (raw.output ?? 0);
  if (rawSum > 0 && Math.abs(rawSum / total - 1) <= RAW_SUM_TOLERANCE) return raw;
  const { isl, osl } = row;
  if (typeof isl !== 'number' || typeof osl !== 'number' || !(isl + osl > 0)) return null;
  const share = isl / (isl + osl);
  return {
    input: raw.input === undefined ? undefined : total * share,
    output: raw.output === undefined ? undefined : total * (1 - share),
  };
}

/**
 * Input and output throughput per deployment chip, whatever basis the row is on,
 * so they add up with `tput_per_gpu`. Use this for anything that must not move
 * with the chip-basis toggle, such as the measured input/output token mix. Falls
 * back to the stored rates when the denominator cannot be pinned down.
 */
export function perTotalChipRates(row: RateRow): { input?: number; output?: number } {
  return (
    exactPerTotalChipRates(row) ?? {
      input: row.input_tput_per_gpu,
      output: row.output_tput_per_gpu,
    }
  );
}

/**
 * Measured input share of a row's tokens: input / (input + output) once the two
 * rates are on the per-deployment-chip basis `tput_per_gpu` uses, so the result
 * never follows the chip-basis toggle. Rows still carrying raw per-total producer
 * rates (fixtures, artifacts read before ingest) already add up and are accepted
 * as they are; a genuine per-pool row's raw rates sum to at least
 * `1 + min(p, d) / max(p, d)` times the total and cannot pass. Returns null when
 * neither reading adds up within `tolerance`.
 */
export function measuredInputShare(
  row: RateRow & { tput_per_gpu?: number },
  tolerance: number,
): number | null {
  const total = row.tput_per_gpu ?? 0;
  if (!(total > 0)) return null;
  const converted = perTotalChipRates(row);
  for (const rates of [
    converted,
    { input: row.input_tput_per_gpu, output: row.output_tput_per_gpu },
  ]) {
    const input = rates.input ?? 0;
    const sum = input + (rates.output ?? 0);
    if (sum > 0 && Math.abs(sum / total - 1) <= tolerance) return input / sum;
  }
  return null;
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
  if (basis === 'pool' || row.chip_basis === 'total' || !row.disagg) return row;
  const rates = exactPerTotalChipRates({ ...row, ...row.metrics, chip_basis: undefined });
  if (!rates) return row;
  const metrics = { ...row.metrics };
  if (typeof rates.input === 'number') metrics.input_tput_per_gpu = rates.input;
  if (typeof rates.output === 'number') metrics.output_tput_per_gpu = rates.output;
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

const CSV_NOTES = {
  en: {
    pool: 'Chip basis: per prefill/decode chip. Disaggregated configs divide input throughput by prefill chips and output throughput by decode chips (g_chips=pool).',
    total:
      'Chip basis: per total chip. Disaggregated configs divide input and output throughput by every chip in the deployment (g_chips=total).',
  },
  zh: {
    pool: '芯片口径：按预填充/解码芯片。分离式配置的输入吞吐量按预填充芯片计，输出吞吐量按解码芯片计（g_chips=pool）。',
    total:
      '芯片口径：按芯片总数。分离式配置的输入与输出吞吐量均按部署中的芯片总数计（g_chips=total）。',
  },
} as const;

/** CSV note naming the chip basis behind an export's input/output-derived columns. */
export function chipBasisCsvNote(basis: ChipBasis, locale: 'en' | 'zh'): string {
  return CSV_NOTES[locale][basis];
}
