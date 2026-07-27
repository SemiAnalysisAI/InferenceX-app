import { getModelExclusion, getSequenceExclusion, Model, Sequence } from '@/lib/data-mappings';
import { buildExclusion, type Exclusion } from '@/lib/exclusion';

/**
 * Preferred engine group when an official comparison first encounters multiple
 * valid groups and has no sticky user selection to preserve.
 */
export function comparisonDefaultGroup(
  model: Parameters<typeof getModelExclusion>[0],
  sequence: Parameters<typeof getSequenceExclusion>[0],
  isUnofficialRun: boolean,
): string | null {
  if (!isUnofficialRun && model === Model.DeepSeek_V4_Pro && sequence === Sequence.AgenticTraces) {
    return 'vllm';
  }
  return null;
}

/**
 * Resolve the production comparability guard for the current chart scope.
 * Unofficial previews are diagnostic and intentionally allow engine families
 * to share a graph, even when the corresponding official view does not.
 */
export function comparisonExclusion(
  model: Parameters<typeof getModelExclusion>[0],
  sequence: Parameters<typeof getSequenceExclusion>[0],
  isUnofficialRun: boolean,
): Exclusion | null {
  if (isUnofficialRun) return null;

  const modelSpecs = getModelExclusion(model);
  const sequenceSpecs = getSequenceExclusion(sequence);
  if (modelSpecs.length === 0 && sequenceSpecs.length === 0) return null;
  if (modelSpecs.length === 0) return buildExclusion(sequenceSpecs);
  if (sequenceSpecs.length === 0) return buildExclusion(modelSpecs);
  return buildExclusion([...modelSpecs, ...sequenceSpecs]);
}
