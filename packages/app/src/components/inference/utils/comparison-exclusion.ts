import {
  getModelExclusion,
  getSequenceDefaultExclusionGroup,
  getSequenceExclusion,
  getSequenceExclusionFamilies,
  getSequenceExclusionPolicy,
} from '@/lib/data-mappings';
import { buildExclusion, type Exclusion, type ExclusionConflictPolicy } from '@/lib/exclusion';

/**
 * Preferred engine group when an official comparison first encounters multiple
 * valid groups and has no sticky user selection to preserve. Unofficial
 * previews impose no guard, so they have no default either.
 */
export function comparisonDefaultGroup(
  sequence: Parameters<typeof getSequenceExclusion>[0],
  isUnofficialRun: boolean,
): string | null {
  if (isUnofficialRun) return null;
  return getSequenceDefaultExclusionGroup(sequence);
}

/**
 * How the current scenario resolves a multi-group selection. Scenarios that
 * restrict standard-token engines keep one group so the chart still renders on
 * load; variant-only rules (e.g. fixed-seq MTP alone) clear every conflicting
 * group so those configs stay deselected until the user picks one.
 */
export function comparisonExclusionPolicy(
  sequence: Parameters<typeof getSequenceExclusion>[0],
): ExclusionConflictPolicy {
  return getSequenceExclusionPolicy(sequence);
}

/**
 * Resolve the production comparability guard for the current chart scope.
 * Unofficial previews are diagnostic and intentionally allow engine families
 * to share a graph, even when the corresponding official view does not.
 *
 * A scenario's `exclusionFamilies` allowlist narrows the model's variant specs
 * as well as the sequence's own, so a family the scenario leaves out (8K/1K
 * TRTLLM, ATOM) escapes the model-level MTP rule too — otherwise its MTP
 * configs would still be grouped and blocked.
 */
export function comparisonExclusion(
  model: Parameters<typeof getModelExclusion>[0],
  sequence: Parameters<typeof getSequenceExclusion>[0],
  isUnofficialRun: boolean,
  isOverviewHistoryPair = false,
): Exclusion | null {
  // The Overview percentage deliberately compares each snapshot's independently
  // best serving envelope. Its detail link must preserve that exact pair even
  // when the normal like-for-like engine guard would choose only one family.
  if (isUnofficialRun || isOverviewHistoryPair) return null;

  const specs = [...getModelExclusion(model), ...getSequenceExclusion(sequence)];
  if (specs.length === 0) return null;

  const families = getSequenceExclusionFamilies(sequence);
  if (!families) return buildExclusion(specs);
  return buildExclusion(
    specs.map((spec) => ({
      ...spec,
      // Intersect rather than replace: a spec that already narrows itself keeps
      // its own limit, and the scenario can only ever narrow further.
      participatingFamilies: spec.participatingFamilies
        ? spec.participatingFamilies.filter((family) => families.includes(family))
        : families,
    })),
  );
}
