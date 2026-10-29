import { useEffect, type RefObject } from 'react';

import { track } from '@/lib/analytics/analytics';
import { getNavigationTiming } from '@/lib/analytics/navigation-timing';

/** Scatter points are drawn as `.dot-group` elements by the D3 scatter layer. */
const DATA_POINT_SELECTOR = '.dot-group';

let reportedNavigation: { pathname: string; startedAt: number } | null = null;

function addsDataPoint(records: MutationRecord[]): boolean {
  return records.some((record) =>
    [...record.addedNodes].some(
      (node) =>
        node instanceof Element &&
        (node.matches(DATA_POINT_SELECTOR) || node.querySelector(DATA_POINT_SELECTOR) !== null),
    ),
  );
}

/**
 * Sends `inference_chart_rendered` once per navigation, when the first chart under `rootRef` has data
 * points in the DOM. `ms_since_navigation` counts from the latest navigation start (document load or
 * soft navigation), so it is the real-user time to a usable chart that Lighthouse LCP cannot see.
 *
 * After mount, only newly added points count: a model switch keeps the previous points mounted while
 * the controls re-render, and those stale points must not be reported as the new navigation's chart.
 */
export function useFirstChartRenderTiming(rootRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const report = () => {
      const navigation = getNavigationTiming(window.location.pathname);
      if (
        reportedNavigation?.pathname === navigation.pathname &&
        reportedNavigation.startedAt === navigation.startedAt
      )
        return;
      reportedNavigation = { pathname: navigation.pathname, startedAt: navigation.startedAt };
      track('inference_chart_rendered', {
        ms_since_navigation: Math.round(performance.now() - navigation.startedAt),
        soft_navigation: navigation.soft,
        route: navigation.pathname,
      });
    };
    // Points present at mount were drawn for this navigation, since the root is new.
    if (root.querySelector(DATA_POINT_SELECTOR)) report();
    // Stays connected: a model switch keeps this root mounted but redraws its points.
    const observer = new MutationObserver((records) => {
      if (addsDataPoint(records)) report();
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [rootRef]);
}
