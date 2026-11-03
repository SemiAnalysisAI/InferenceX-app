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
 * Whether a disaggregated row records its real prefill and decode pool sizes:
 * worker counts are present, or the two pool fields differ. Only the legacy shape
 * (no workers, the whole deployment mirrored in both fields) is treated as unsplit.
 */
export function hasPoolSplit(row: ChipCounts): boolean {
  if (row.disagg !== true || !chipCount(row.num_prefill_gpu) || !chipCount(row.num_decode_gpu)) {
    return false;
  }
  return (
    row.num_prefill_gpu !== row.num_decode_gpu ||
    (chipCount(row.prefill_num_workers) && chipCount(row.decode_num_workers))
  );
}

/**
 * Legacy Dynamo rows (2025-09-29 to 2025-12-05) carry `disagg: true` with no
 * workers and both pool sizes set to the whole deployment N. Some carry rates per
 * deployment chip (most of October 2025), later ones per pool with the real pool
 * sizes never stored; `exactPerTotalChipRates` tells them apart from the rates.
 */
function isUnsplitDisagg(row: ChipCounts): boolean {
  return (
    row.disagg === true &&
    !hasPoolSplit(row) &&
    chipCount(row.num_prefill_gpu) &&
    row.num_prefill_gpu === row.num_decode_gpu
  );
}

/** Every chip in a disaggregated deployment, or undefined when unknown. */
export function disaggDeploymentChips(row: ChipCounts): number | undefined {
  if (hasPoolSplit(row)) return row.num_prefill_gpu! + row.num_decode_gpu!;
  return isUnsplitDisagg(row) ? row.num_prefill_gpu : undefined;
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
 * denominator cannot be pinned down.
 *
 * Rows split into pools rescale by the pool sizes. Unsplit legacy rows record
 * neither pool size, so they are read from the rates themselves: rows whose input
 * and output already add up to `tput_per_gpu` are per deployment chip; otherwise
 * the prefill share p of the deployment solves `T = input × p + output × (1 − p)`
 * exactly. ISL:OSL is a fallback for the degenerate input = output case. A legacy
 * row with only one rate cannot be told apart and is returned as stored.
 */
export function exactPerTotalChipRates(row: RateRow): { input?: number; output?: number } | null {
  const input = row.input_tput_per_gpu;
  const output = row.output_tput_per_gpu;
  if (row.chip_basis === 'total' || !row.disagg) return { input, output };
  if (hasPoolSplit(row)) {
    const chips = row.num_prefill_gpu! + row.num_decode_gpu!;
    return {
      input: typeof input === 'number' ? input * (row.num_prefill_gpu! / chips) : input,
      output: typeof output === 'number' ? output * (row.num_decode_gpu! / chips) : output,
    };
  }
  if (!isUnsplitDisagg(row)) return null;
  if (typeof input !== 'number' || typeof output !== 'number') return { input, output };
  const total = row.tput_per_gpu;
  if (!(typeof total === 'number' && total > 0)) return null;
  if (Math.abs((input + output) / total - 1) <= RAW_SUM_TOLERANCE) return { input, output };
  if (input !== output) {
    const prefillShare = (total - output) / (input - output);
    if (prefillShare > 0 && prefillShare < 1) {
      return { input: input * prefillShare, output: output * (1 - prefillShare) };
    }
  }
  const { isl, osl } = row;
  if (typeof isl !== 'number' || typeof osl !== 'number' || !(isl + osl > 0)) return null;
  const share = isl / (isl + osl);
  return { input: total * share, output: total * (1 - share) };
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
  if (row.disagg && row.chip_basis !== 'total') {
    const converted = exactPerTotalChipRates(row);
    const share = converted
      ? inputShareWithin(converted.input, converted.output, total, tolerance)
      : null;
    if (share !== null) return share;
  }
  return inputShareWithin(row.input_tput_per_gpu, row.output_tput_per_gpu, total, tolerance);
}

function inputShareWithin(
  rawInput: number | undefined,
  rawOutput: number | undefined,
  total: number,
  tolerance: number,
): number | null {
  const input = rawInput ?? 0;
  const sum = input + (rawOutput ?? 0);
  return sum > 0 && Math.abs(sum / total - 1) <= tolerance ? input / sum : null;
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
  const stored = row.metrics;
  const rates = exactPerTotalChipRates({
    disagg: row.disagg,
    num_prefill_gpu: row.num_prefill_gpu,
    num_decode_gpu: row.num_decode_gpu,
    prefill_num_workers: row.prefill_num_workers,
    decode_num_workers: row.decode_num_workers,
    isl: row.isl,
    osl: row.osl,
    tput_per_gpu: stored.tput_per_gpu,
    input_tput_per_gpu: stored.input_tput_per_gpu,
    output_tput_per_gpu: stored.output_tput_per_gpu,
  });
  if (!rates) return row;
  const metrics = { ...stored };
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
