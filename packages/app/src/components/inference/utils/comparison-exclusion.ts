import {
  getModelExclusion,
  getSequenceDefaultExclusionGroup,
  getSequenceExclusion,
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
