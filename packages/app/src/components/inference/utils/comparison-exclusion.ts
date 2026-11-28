import {
  getModelExclusion,
  getScenarioDefaultExclusionGroup,
  getScenarioExclusion,
  getScenarioExclusionFamilies,
  getScenarioExclusionPolicy,
} from '@/lib/catalog/data-mappings';
import {
  buildExclusion,
  resolveExclusionToggle,
  type Exclusion,
  type ExclusionConflictPolicy,
} from '@/lib/benchmarks/exclusion';
import { needsEngineComparisonConsent } from '@/components/inference/hooks/use-engine-comparison-consent';

export function isEngineGuardLifted(
  isUnofficialRun: boolean,
  featureGateUnlocked: boolean,
): boolean {
  return isUnofficialRun || featureGateUnlocked;
}

export function comparisonDefaultGroup(
  sequence: Parameters<typeof getScenarioExclusion>[0],
  isUnofficialRun: boolean,
): string | null {
  if (isUnofficialRun) return null;
  return getScenarioDefaultExclusionGroup(sequence);
}

export function comparisonExclusionPolicy(
  sequence: Parameters<typeof getScenarioExclusion>[0],
): ExclusionConflictPolicy {
  return getScenarioExclusionPolicy(sequence);
}

export function comparisonExclusion(
  model: Parameters<typeof getModelExclusion>[0],
  sequence: Parameters<typeof getScenarioExclusion>[0],
  isUnofficialRun: boolean,
  isOverviewHistoryPair = false,
): Exclusion | null {
  if (isUnofficialRun || isOverviewHistoryPair) return null;

  const specs = [...getModelExclusion(model), ...getScenarioExclusion(sequence)];
  if (specs.length === 0) return null;

  const families = getScenarioExclusionFamilies(sequence);
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

export interface BlockedComparisonToggle {
  attempted: string;
  existing: string | null;
}

/**
 * Inactive legend keys that a click cannot enable because the engine exclusion
 * blocks them, with the conflict the blocked click reports. Keys that open the
 * vLLM/SGLang consent dialog instead are not blocked and are left out.
 */
export function blockedComparisonToggles(
  active: Set<string>,
  candidates: Set<string>,
  exclusion: Exclusion | null,
  consentSupported: boolean,
): Map<string, BlockedComparisonToggle> {
  const blocked = new Map<string, BlockedComparisonToggle>();
  if (!exclusion) return blocked;
  for (const key of candidates) {
    if (active.has(key)) continue;
    if (consentSupported && needsEngineComparisonConsent([...active, key], exclusion)) continue;
    const decision = resolveExclusionToggle(active, key, candidates, exclusion);
    if (decision.kind === 'block') {
      blocked.set(key, { attempted: decision.attempted, existing: decision.existing });
    }
  }
  return blocked;
}
