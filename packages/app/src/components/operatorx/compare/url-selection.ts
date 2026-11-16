import { replaceClientSearch } from '@/lib/routing/client-navigation';

/** Address-bar params that keep the GPU picks and baseline, so share links reproduce them. */
export const HARDWARE_PARAM = 'hardware';
export const BASELINE_PARAM = 'baseline';

/** The picked GPUs from `hardware=a,b` (the same list the OperatorX view API takes), or null when the view shows every measured GPU. */
export function parsePickedHardware(value: string | null): string[] | null {
  const picked = (value ?? '').split(',').filter(Boolean);
  return picked.length > 0 ? picked : null;
}

/** Sets `key` in the address bar, or removes it when `value` is null or empty. */
export function setSearchParam(key: string, value: string | null): void {
  const params = new URLSearchParams(window.location.search);
  if (value) params.set(key, value);
  else params.delete(key);
  replaceClientSearch(params);
}

export function setPickedHardware(picked: string[] | null): void {
  setSearchParam(HARDWARE_PARAM, picked?.join(',') ?? null);
}
