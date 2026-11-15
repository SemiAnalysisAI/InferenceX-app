/** Number formatting shared by the SLA Targets table, charts and tooltips. */

/** `0.9942` as `99.42%`; whole values drop the decimals, tiny ones keep them. */
export function formatPercent(fraction: number): string {
  const percent = fraction * 100;
  if (percent === 100 || percent === 0) return `${percent}%`;
  const digits = percent >= 99.995 ? 3 : 2;
  // Never round a value below 100% up to it: a miss must not read as a pass.
  const floored = Math.floor(percent * 10 ** digits) / 10 ** digits;
  return `${floored.toFixed(digits)}%`;
}

/** A rate with three significant digits: `0.0364`, `5.21`, `135`. */
export function formatRate(value: number): string {
  if (value === 0) return '0';
  if (value >= 100) return value.toFixed(0);
  return Number(value.toPrecision(3)).toString();
}

/** `$3.21`; more digits below a dollar so cheap rows stay distinguishable. */
export function formatUsd(value: number): string {
  if (value >= 100) return `$${Math.round(value).toLocaleString('en-US')}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${Number(value.toPrecision(2)).toString()}`;
}

export function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

/** Seconds without trailing zeros: `3600`, `3585.26`. */
export function formatSeconds(value: number): string {
  return Number(value.toFixed(2)).toString();
}
