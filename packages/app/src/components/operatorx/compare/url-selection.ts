import { topLevelModel } from '@semianalysisai/inferencex-db/operatorx/workloads';

import { replaceClientSearch } from '@/lib/routing/client-navigation';
import { DEFAULT_OPERATORX_MODEL } from '@/lib/routing/operatorx-category';

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

/**
 * The listed model a Model View `model` param opens: the model itself; for a link that names an
 * OperatorX family (`GLM-5.x`, from before the view used the inference model list), the first
 * listed model of that family; otherwise the default model, or the first listed one.
 */
export function listedModel(requested: string, listed: readonly string[]): string | undefined {
  if (listed.includes(requested)) return requested;
  return (
    listed.find((model) => topLevelModel(model) === requested) ??
    (listed.includes(DEFAULT_OPERATORX_MODEL) ? DEFAULT_OPERATORX_MODEL : listed[0])
  );
}
