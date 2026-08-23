/**
 * Anchor resolution for the "click a point for server metrics and logs"
 * coach mark on the agentic inference chart.
 *
 * The affordance it teaches: clicking an agentic scatter point pins its
 * tooltip, and the pinned tooltip carries a "View charts" link to
 * `/inference/agentic/[id]`. Nothing on the chart hints at that, so first-time
 * visitors never find it.
 */

import { plotBounds } from '@/lib/d3-chart/plot-bounds';

import { isAnchorOnScreen, isAnchorWithin, viewportSize } from './anchor';

export const AGENTIC_COACH_MARK_STORAGE_KEY = 'inferencex-agentic-point-coach-mark-dismissed';

/**
 * Dispatched by ScatterGraph after every full D3 render.
 *
 * The coach mark needs a painted point to anchor to, and the chart paints
 * asynchronously (availability → benchmarks → derived metrics). A plain timer
 * would fire into an empty chart and give up; re-attempting on each render
 * means the tip appears as soon as there is something to point at. Exported so
 * the dispatch site imports a stable constant, mirroring `GRADIENT_NUDGE_EVENT`.
 */
export const SCATTER_RENDERED_EVENT = 'inferencex:scatter-chart-rendered';

/**
 * Official agentic points on the main inference scatter chart.
 *
 * Deliberately scoped to `[data-testid="scatter-graph"]` and to `.dot-group`:
 *  - the GPU comparison charts (`[data-testid="gpu-graph"]`) are a different
 *    surface with their own layout;
 *  - unofficial-run overlay markers are `.unofficial-overlay-pt`, and their
 *    tooltip has no "View charts" link (overlay runs have no stored trace), so
 *    pointing at one would teach a dead end.
 */
const SCATTER_GRAPH_SELECTOR = '[data-testid="scatter-graph"]';
const COACH_MARK_ROOT_SELECTOR = '[data-coach-mark-root]';
const AGENTIC_POINT_GROUP_SELECTOR = '.dot-group[data-benchmark-type="agentic_traces"]';

export const AGENTIC_POINT_SELECTOR = `${SCATTER_GRAPH_SELECTOR} ${AGENTIC_POINT_GROUP_SELECTOR}`;

/**
 * Clicking any scatter point — official or overlay — means the user found the
 * interaction, so the coach mark has done its job.
 */
export const AGENTIC_POINT_ACTION_SELECTOR =
  '[data-testid="scatter-graph"] .dot-group, [data-testid="scatter-graph"] .unofficial-overlay-pt';

function isRendered(element: Element): boolean {
  // Hidden points stay in the DOM at opacity 0 with pointer-events off (see
  // the ScatterGraph decoration effect) — they are not clickable, so they are
  // not anchor candidates either.
  const style = getComputedStyle(element);
  return style.opacity !== '0' && style.pointerEvents !== 'none' && style.visibility !== 'hidden';
}

function agenticPointGroup(element: Element): SVGGElement | null {
  const group = element.matches(AGENTIC_POINT_GROUP_SELECTOR)
    ? element
    : element.closest(AGENTIC_POINT_GROUP_SELECTOR);
  return group as SVGGElement | null;
}

function canOpenTrace(group: SVGGElement): boolean {
  return group.dataset.hasTrace === 'true' || group.dataset.traceAvailability !== 'resolved';
}

/**
 * Validate one previously selected point without rescanning every series.
 *
 * D3 coordinate transitions mutate every point's `transform` each frame. The
 * coach mark can keep following its chosen point while this stays non-null;
 * filtering, clipping, or resolved-empty trace availability invalidates it and
 * sends the caller back through `resolveAgenticPointAnchor`.
 */
export function getAgenticPointAnchorRect(element: Element): DOMRect | null {
  if (typeof document === 'undefined') return null;
  const group = agenticPointGroup(element);
  const chart = group?.closest<HTMLElement>(SCATTER_GRAPH_SELECTOR);
  if (!group || !chart || !isRendered(group) || !canOpenTrace(group)) return null;

  const viewport = viewportSize();
  const rect = element.getBoundingClientRect();
  if (!isAnchorOnScreen(rect, viewport)) return null;

  const svg = chart.querySelector('[data-testid="d3-chart-svg"]');
  const plot =
    (svg && plotBounds(svg)) ?? svg?.getBoundingClientRect() ?? chart.getBoundingClientRect();
  return isAnchorWithin(rect, plot) ? rect : null;
}

/**
 * Observe the stable chart owner so point mutations are local, while replacing
 * the chart itself still invalidates the cached anchor.
 */
export function getAgenticPointAnchorMutationRoot(element: Element | null): Node | null {
  if (typeof document === 'undefined') return null;
  return (
    element?.closest(COACH_MARK_ROOT_SELECTOR) ??
    element?.closest(SCATTER_GRAPH_SELECTOR) ??
    document.querySelector(COACH_MARK_ROOT_SELECTOR) ??
    document.querySelector(SCATTER_GRAPH_SELECTOR)
  );
}

/**
 * Pick the agentic point to point at: the eligible candidate nearest the
 * chart's centre, so the callout has room on every side and the choice is
 * stable between re-renders of the same view.
 *
 * Prefers points with stored telemetry (`data-has-trace`) — those are the ones
 * whose tooltip actually offers "View charts" — and falls back to any visible
 * agentic point while the availability lookup is still in flight.
 */
export function resolveAgenticPointAnchor(): Element | null {
  if (typeof document === 'undefined') return null;

  const viewport = viewportSize();
  const eligible: {
    element: SVGGElement;
    hasTrace: boolean;
    traceAvailability: string | undefined;
    distance: number;
  }[] = [];

  for (const chart of document.querySelectorAll<HTMLElement>('[data-testid="scatter-graph"]')) {
    const chartRect = chart.getBoundingClientRect();
    // Cheap bail-out. This runs on every scroll event, and the full scan is a
    // layout read per point, so reject each off-screen chart first.
    if (
      chartRect.bottom <= 0 ||
      chartRect.top >= viewport.height ||
      chartRect.right <= 0 ||
      chartRect.left >= viewport.width
    ) {
      continue;
    }

    const chartCx = chartRect.left + chartRect.width / 2;
    const chartCy = chartRect.top + chartRect.height / 2;
    // Zoomed points retain ordinary bounding boxes outside the clip region.
    // Check against the plot rather than the SVG box, which includes gutters.
    const svg = chart.querySelector('[data-testid="d3-chart-svg"]');
    const plot = (svg && plotBounds(svg)) ?? svg?.getBoundingClientRect() ?? chartRect;

    for (const element of chart.querySelectorAll<SVGGElement>(AGENTIC_POINT_GROUP_SELECTOR)) {
      if (!isRendered(element)) continue;
      const rect = element.getBoundingClientRect();
      if (!isAnchorOnScreen(rect, viewport)) continue;
      if (!isAnchorWithin(rect, plot)) continue;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      eligible.push({
        element,
        hasTrace: element.dataset.hasTrace === 'true',
        traceAvailability: element.dataset.traceAvailability,
        distance: (cx - chartCx) ** 2 + (cy - chartCy) ** 2,
      });
    }
  }

  if (eligible.length === 0) return null;

  const withTrace = eligible.filter((candidate) => candidate.hasTrace);
  const pending = eligible.filter((candidate) => candidate.traceAvailability !== 'resolved');
  const pool = withTrace.length > 0 ? withTrace : pending;
  if (pool.length === 0) return null;
  const chosen = pool.reduce((best, candidate) =>
    candidate.distance < best.distance ? candidate : best,
  ).element;

  // Point at the marker, not at the group: a `.dot-group` also contains the
  // hit area and point label, so its bounding box centre can sit off the dot.
  return chosen.querySelector('.visible-shape') ?? chosen;
}
