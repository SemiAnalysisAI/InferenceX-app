/**
 * Whether the agentic detail page was opened from an Inference chart in this tab, so its Back
 * control can leave the way it came (`router.back()`) instead of stacking another chart entry.
 *
 * The chart notes the moment it unmounts. A detail page that mounts in the same navigation came
 * from it; a deep link or a new tab has no such moment. Stepping to a sibling point replaces the
 * detail entry, so the origin carries over to the sibling.
 */

/** Unmount and the next page's mount land in the same commit; this only absorbs scheduling. */
const SAME_NAVIGATION_MS = 1000;

let chartLeftAt = Number.NEGATIVE_INFINITY;
let siblingStepPending = false;
let openedFromChart = false;

export function noteInferenceChartLeft(): void {
  chartLeftAt = performance.now();
}

export function noteAgenticSiblingStep(): void {
  siblingStepPending = true;
}

/** Call once per detail point the page shows; reports whether Back can return with history. */
export function resolveAgenticDetailOrigin(): boolean {
  if (siblingStepPending) {
    siblingStepPending = false;
    return openedFromChart;
  }
  openedFromChart = performance.now() - chartLeftAt < SAME_NAVIGATION_MS;
  chartLeftAt = Number.NEGATIVE_INFINITY;
  return openedFromChart;
}
