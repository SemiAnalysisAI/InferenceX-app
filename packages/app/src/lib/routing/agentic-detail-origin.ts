/**
 * Whether the agentic detail page was opened from an Inference chart in this tab, so its Back
 * control can leave the way it came (`router.back()`) instead of stacking another chart entry.
 *
 * The chart notes the moment it unmounts. A detail page that mounts in the same navigation came
 * from it; a deep link or a new tab has no such moment. The answer is remembered for the detail
 * session: the point it opened plus every sibling stepped to from it (sibling steps replace the
 * detail entry). Asking again for a point in the session returns the same answer, so effects that
 * run twice (React Strict Mode), remounts and repeated commits cannot change it.
 */

/** Unmount and the next page's mount land in the same commit; this only absorbs scheduling. */
const SAME_NAVIGATION_MS = 1000;

interface DetailSession {
  openedFromChart: boolean;
  pointIds: Set<number>;
}

let chartLeftAt = Number.NEGATIVE_INFINITY;
let session: DetailSession | null = null;

/** The chart is on screen: any earlier detail session is over. */
export function noteInferenceChartShown(): void {
  chartLeftAt = Number.NEGATIVE_INFINITY;
  session = null;
}

export function noteInferenceChartLeft(): void {
  chartLeftAt = performance.now();
}

/** The detail page is stepping to sibling `pointId`; it joins the current detail session. */
export function noteAgenticSiblingStep(pointId: number): void {
  session?.pointIds.add(pointId);
}

/** Whether the detail page for `pointId` was opened from a chart in this tab. Idempotent. */
export function resolveAgenticDetailOrigin(pointId: number): boolean {
  if (performance.now() - chartLeftAt < SAME_NAVIGATION_MS) {
    chartLeftAt = Number.NEGATIVE_INFINITY;
    session = { openedFromChart: true, pointIds: new Set([pointId]) };
  } else if (session === null || !session.pointIds.has(pointId)) {
    session = { openedFromChart: false, pointIds: new Set([pointId]) };
  }
  return session.openedFromChart;
}
