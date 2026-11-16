import type { ComputePrecision } from '@semianalysisai/inferencex-db/operatorx/compare';

/** Independent chart instances must not overwrite one another's selections. */
export const OPERATORX_SHARE_CONTROLS = [
  'modelPrecision',
  'modelBin',
  'modelSweep',
  'rooflinePrecision',
  'rooflineNormalized',
  'rooflineLog',
  'summaryPrecision',
  'summaryNormalized',
  'summarySharedOnly',
] as const;

export function sharePrecision(value: string | null): ComputePrecision | null {
  return value === 'bf16' || value === 'fp8' || value === 'fp4' ? value : null;
}

export function shareBoolean(value: string | null, fallback: boolean): boolean {
  return value === 'true' ? true : value === 'false' ? false : fallback;
}

export function shareBin(value: string | null): number | null {
  if (value === null || !/^(?:0|[1-9]\d*)$/u.test(value)) return null;
  const bin = Number(value);
  return Number.isSafeInteger(bin) && bin <= 1023 ? bin : null;
}

/** Valid explicit overrides. Missing/invalid values leave workload defaults in charge. */
export function operatorXShareState(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of OPERATORX_SHARE_CONTROLS) {
    const value = params.get(key);
    if (value === null) continue;
    if (
      key.endsWith('Precision')
        ? sharePrecision(value) !== null
        : key === 'modelBin'
          ? shareBin(value) !== null
          : value === 'true' || value === 'false'
    )
      out[key] = value;
  }
  return out;
}
