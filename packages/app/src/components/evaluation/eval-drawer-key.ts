/**
 * Composite key helpers for the eval samples drawer share link.
 *
 * The key encodes the unique aggregation dimensions so links survive
 * re-ingests (evalResultId churns on every run, but these fields are stable).
 *
 * Format: <benchmark>~<hardware>~<precision>~<framework>~<spec>~<disagg>~<conc>~<tp>~<runId>
 *
 * Fields:
 *   benchmark  — e.g. "gsm8k"
 *   hardware   — bare hardware key, e.g. "mi355x"
 *   precision  — e.g. "fp4"
 *   framework  — e.g. "vllm"
 *   spec       — spec-decode method, e.g. "none"
 *   disagg     — "1" | "0"
 *   conc       — concurrency, e.g. "32"
 *   tp         — tensor-parallelism, e.g. "8"
 *   runId      — GitHub Actions run ID for unofficial rows; "" for official rows
 */

import type { EvaluationChartData } from '@/components/evaluation/types';

export const DRAWER_KEY_DELIMITER = '~';

/**
 * Builds the composite drawer key from a table row.
 * Works for both official rows (runId = "") and unofficial rows (runId from runUrl).
 */
export function rowToDrawerKey(row: EvaluationChartData): string {
  const runId = extractRunIdFromUrl(row.runUrl);
  const parts = [
    row.benchmark,
    row.hardware,
    row.precision,
    row.framework,
    row.specDecode,
    row.disagg ? '1' : '0',
    String(row.conc),
    String(row.tp),
    runId ?? '',
  ];
  return parts.join(DRAWER_KEY_DELIMITER);
}

/**
 * Finds the first row in `rows` whose composite key matches `key`.
 * Returns null if no match is found.
 */
export function findRowByDrawerKey(
  rows: EvaluationChartData[],
  key: string,
): EvaluationChartData | null {
  for (const row of rows) {
    if (rowToDrawerKey(row) === key) return row;
  }
  return null;
}

function extractRunIdFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/actions\/runs\/(\d+)/u);
  return m ? m[1] : null;
}
