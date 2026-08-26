/**
 * Number formatting shared by the /rankings and /run server-rendered pages.
 * Locale-independent by design: both the English and Chinese pages quote
 * half-width digits with the same precision, per docs/chinese-copy.md.
 */

/** Tokens/s per GPU: whole numbers above 100, one decimal below. */
export function fmtThroughput(value: number): string {
  return value >= 100 ? Math.round(value).toLocaleString('en-US') : value.toFixed(1);
}

/** $ per million tokens: cents precision, sub-cent gets a third digit. */
export function fmtCostPerMtok(value: number): string {
  return `$${value >= 0.1 ? value.toFixed(2) : value.toFixed(3)}`;
}

/** $/GPU/hr price points from HW_REGISTRY. */
export function fmtGpuHour(value: number): string {
  return `$${value.toFixed(2)}`;
}

/** Percentage delta between a winner and a runner-up, e.g. 23. */
export function pctFaster(winner: number, runnerUp: number): number {
  return Math.round((winner / runnerUp - 1) * 100);
}

/** Milliseconds with sensible precision for TTFT/TPOT quotes. */
export function fmtMs(value: number): string {
  return value >= 100 ? `${Math.round(value)} ms` : `${value.toFixed(1)} ms`;
}
