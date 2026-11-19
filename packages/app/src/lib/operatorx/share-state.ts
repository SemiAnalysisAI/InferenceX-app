import type { ComputePrecision } from '@semianalysisai/inferencex-db/operatorx/compare';

export function sharePrecision(value: string | null): ComputePrecision | null {
  return value === 'bf16' || value === 'fp8' || value === 'fp4' ? value : null;
}

export function shareBoolean(value: string | null, fallback: boolean): boolean {
  return value === 'true' ? true : value === 'false' ? false : fallback;
}

/** A nonnegative half-octave size bin (`sizeBin`); 1023 bins span far beyond any token count. */
export function shareBin(value: string | null): number | null {
  if (value === null || !/^(?:0|[1-9]\d*)$/u.test(value)) return null;
  const bin = Number(value);
  return Number.isSafeInteger(bin) && bin <= 1023 ? bin : null;
}
