const LOG_MANTISSAS = [1, 2, 5] as const;

function evenlySpaced<T>(values: T[], count: number): T[] {
  if (values.length <= count) return values;
  if (count <= 1) return [values[Math.floor(values.length / 2)]];

  const selected: T[] = [];
  for (let index = 0; index < count; index += 1) {
    selected.push(values[Math.round((index * (values.length - 1)) / (count - 1))]);
  }
  return selected;
}

function fallbackLogTicks(min: number, max: number, maxTicks: number): number[] {
  const count = Math.min(maxTicks, 3);
  const logMin = Math.log(min);
  const logSpan = Math.log(max) - logMin;
  const ticks = Array.from({ length: count }, (_, index) => {
    const value = Math.exp(logMin + (logSpan * index) / Math.max(1, count - 1));
    return Number(value.toPrecision(2));
  });
  return [...new Set(ticks)].filter((value) => value >= min && value <= max);
}

/**
 * Generate sparse 1-2-5 log ticks instead of D3's dense minor-tick sequence.
 * The callback is evaluated against the current visible domain, including zoom.
 */
export function sparseLogTicks(domain: number[], maxTicks: number): number[] {
  const numericDomain = domain.filter((value) => Number.isFinite(value) && value > 0);
  if (numericDomain.length < 2 || maxTicks <= 0) return [];

  const min = Math.min(...numericDomain);
  const max = Math.max(...numericDomain);
  if (min === max) return [min];

  const ticks: number[] = [];
  const firstExponent = Math.floor(Math.log10(min));
  const lastExponent = Math.ceil(Math.log10(max));

  for (let exponent = firstExponent; exponent <= lastExponent; exponent += 1) {
    const magnitude = 10 ** exponent;
    for (const mantissa of LOG_MANTISSAS) {
      const value = mantissa * magnitude;
      if (value >= min && value <= max) ticks.push(value);
    }
  }

  const candidates = ticks.length >= 2 ? ticks : fallbackLogTicks(min, max, maxTicks);
  return evenlySpaced(candidates, maxTicks);
}
