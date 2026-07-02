/**
 * Shared known-issue annotation pipeline for the inference charts.
 *
 * ScatterGraph and GPUGraph both turned `matchKnownConfigIssues(modelLabel,
 * visiblePoints)` into `KnownIssueAnnotation[]` with the same shape — differing
 * only in (a) how `visiblePoints` is assembled (scatter merges the overlay
 * points; GPU uses the filtered comparison points), (b) how each issue's label
 * is derived, and (c) how its color is resolved (scatter uses the hw-derived
 * color, GPU prefers the active (gpu, date) pair's swatch). Those three vary;
 * the map body is identical, so it lives here once.
 *
 * The pure core (`buildKnownIssueAnnotations`) is exported for unit testing
 * without a renderer; the hook is the thin `useMemo` wrapper.
 */

import { useMemo } from 'react';

import { matchKnownConfigIssues, pointMatchesIssue } from '@/lib/known-issues';
import type { KnownIssueAnnotation } from '@/components/inference/utils/knownIssueAnnotations';
import type { InferenceData } from '@/components/inference/types';

interface BuildKnownIssueArgs {
  modelLabel: string;
  /** Points considered "visible" — the ones an annotation may point an arrow at. */
  visiblePoints: InferenceData[];
  /** Per-issue label (scatter: hw label; GPU: config display label). */
  labelFor: (issue: { hwKey: string }) => string;
  /** Per-issue color (scatter: hw color; GPU: active pair swatch fallback to hw). */
  colorFor: (issue: { hwKey: string }) => string;
}

/**
 * Pure: match the model's known config issues against the visible points and
 * project each into a `KnownIssueAnnotation` (label + color from the callbacks,
 * arrow targets from the points that match the issue).
 */
export function buildKnownIssueAnnotations({
  modelLabel,
  visiblePoints,
  labelFor,
  colorFor,
}: BuildKnownIssueArgs): KnownIssueAnnotation[] {
  return matchKnownConfigIssues(modelLabel, visiblePoints).map((issue) => ({
    issue,
    label: labelFor(issue),
    color: colorFor(issue),
    points: visiblePoints
      .filter((p) => pointMatchesIssue(issue, p))
      .map((p) => ({ x: p.x, y: p.y })),
  }));
}

/**
 * Hook wrapper. `deps` is the memo dependency array the caller controls so the
 * annotations recompute exactly when the original inline memo did (the
 * callbacks close over color resolvers / active sets that aren't stable
 * references). Keep the deps matched to the original arrays to avoid broadening
 * (extra rebuilds) or narrowing (stale colors/labels).
 */
export function useKnownIssueAnnotations(
  args: BuildKnownIssueArgs,
  deps: readonly unknown[],
): KnownIssueAnnotation[] {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => buildKnownIssueAnnotations(args), deps);
}
