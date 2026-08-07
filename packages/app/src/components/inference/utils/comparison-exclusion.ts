import {
  getModelExclusion,
  getSequenceDefaultExclusionGroup,
  getSequenceExclusion,
  getSequenceExclusionExemptFamilies,
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
 * The scenario's exempt families are composed onto the model specs too, so a
 * family the scenario declares comparable (8K/1K ATOM) escapes the model-level
 * variant rule as well — otherwise its MTP configs would still be grouped and
 * blocked.
 */
export function comparisonExclusion(
  model: Parameters<typeof getModelExclusion>[0],
  sequence: Parameters<typeof getSequenceExclusion>[0],
  isUnofficialRun: boolean,
): Exclusion | null {
  if (isUnofficialRun) return null;

  const specs = [...getModelExclusion(model), ...getSequenceExclusion(sequence)];
  if (specs.length === 0) return null;

  const exempt = getSequenceExclusionExemptFamilies(sequence);
  if (exempt.length === 0) return buildExclusion(specs);
  return buildExclusion(
    specs.map((spec) => ({ ...spec, exemptFamilies: [...(spec.exemptFamilies ?? []), ...exempt] })),
  );
}
