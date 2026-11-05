import type { AvailableModelSequence } from '@/providers/unofficial-run-provider';
import type { Model } from '@/lib/catalog/data-mappings';

export interface AutoSwitchDecision {
  nextKey: string;
  modelToSet: Model | null;
}

export function computeAutoSwitchDecision(
  unofficialAvailable: AvailableModelSequence[],
  urlModel: string | undefined,
  selectedModel: Model,
  lastKey: string,
): AutoSwitchDecision {
  if (unofficialAvailable.length === 0) {
    return { nextKey: '', modelToSet: null };
  }
  if (urlModel) {
    return { nextKey: lastKey, modelToSet: null };
  }
  const sortedModels = [...new Set(unofficialAvailable.map((a) => a.model))].toSorted();
  const key = sortedModels.join(',');
  if (lastKey === key) {
    return { nextKey: lastKey, modelToSet: null };
  }
  if (sortedModels.includes(selectedModel)) {
    return { nextKey: key, modelToSet: null };
  }
  return { nextKey: key, modelToSet: sortedModels[0] };
}
