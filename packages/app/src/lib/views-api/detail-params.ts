import { ViewsApiParamError } from './errors';

/** Opaque identities are decoded by URLSearchParams once; never decode them again. */
export function requiredText(search: URLSearchParams, key: string, max = 512): string {
  const value = search.get(key);
  if (!value || value.length > max) {
    throw new ViewsApiParamError(key, `${key} is required (maximum ${max} characters)`);
  }
  return value;
}

export function integerParam(
  search: URLSearchParams,
  key: string,
  fallback?: number,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const raw = search.get(key);
  if (raw === null && fallback !== undefined) return fallback;
  if (raw === null || !/^(?:0|[1-9]\d*)$/u.test(raw)) {
    throw new ViewsApiParamError(key, `${key} must be a decimal integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ViewsApiParamError(key, `${key} must be between ${min} and ${max}`);
  }
  return value;
}
