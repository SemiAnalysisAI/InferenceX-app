import {
  findWorkload,
  topLevelModel,
  type WorkloadSource,
} from '@semianalysisai/inferencex-db/operatorx/workloads';

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

/**
 * The model selector of a comparison: the requested model when it is listed or names a shape
 * list (`other`, workloads no listed model maps to); otherwise the listed model of the workload
 * the comparison shows. `measured` is false for a listed model with no workload for this op.
 */
export function workloadSelection(
  workloads: readonly WorkloadSource[],
  current: string | null,
  listed: readonly string[],
  requested: string | null,
): { model: string; other: string[]; measured: boolean } {
  const modelOf = (label: string) => listed.find((m) => topLevelModel(m) === label);
  const other = workloads.filter((w) => !modelOf(w.label)).map((w) => w.label);
  const shown = workloads.find((w) => w.id === current);
  const model =
    requested && (listed.includes(requested) || other.includes(requested))
      ? requested
      : shown
        ? (modelOf(shown.label) ?? shown.label)
        : (requested ?? '');
  return { model, other, measured: Boolean(findWorkload(workloads, model)) };
}
