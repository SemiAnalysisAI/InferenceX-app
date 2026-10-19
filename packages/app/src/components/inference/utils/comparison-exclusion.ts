import {
  getModelExclusion,
  getSequenceDefaultExclusionGroup,
  getSequenceExclusion,
  getSequenceExclusionFamilies,
  getSequenceExclusionPolicy,
} from '@/lib/catalog/data-mappings';
import {
  buildExclusion,
  type Exclusion,
  type ExclusionConflictPolicy,
} from '@/lib/benchmarks/exclusion';

export function isEngineGuardLifted(
  isUnofficialRun: boolean,
  featureGateUnlocked: boolean,
): boolean {
  return isUnofficialRun || featureGateUnlocked;
}

export function comparisonDefaultGroup(
  sequence: Parameters<typeof getSequenceExclusion>[0],
  isUnofficialRun: boolean,
): string | null {
  if (isUnofficialRun) return null;
  return getSequenceDefaultExclusionGroup(sequence);
}

export function comparisonExclusionPolicy(
  sequence: Parameters<typeof getSequenceExclusion>[0],
): ExclusionConflictPolicy {
  return getSequenceExclusionPolicy(sequence);
}

export function comparisonExclusion(
  model: Parameters<typeof getModelExclusion>[0],
  sequence: Parameters<typeof getSequenceExclusion>[0],
  isUnofficialRun: boolean,
  isOverviewHistoryPair = false,
): Exclusion | null {
  if (isUnofficialRun || isOverviewHistoryPair) return null;

  const specs = [...getModelExclusion(model), ...getSequenceExclusion(sequence)];
  if (specs.length === 0) return null;

  const families = getSequenceExclusionFamilies(sequence);
  if (!families) return buildExclusion(specs);
  return buildExclusion(
    specs.map((spec) => ({
      ...spec,
      participatingFamilies: spec.participatingFamilies
        ? spec.participatingFamilies.filter((family) => families.includes(family))
        : families,
    })),
  );
}
