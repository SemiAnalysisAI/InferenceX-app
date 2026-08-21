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
export const AGENTIC_POINT_SELECTOR =
  '[data-testid="scatter-graph"] .dot-group[data-benchmark-type="agentic_traces"]';

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

  const chart = document.querySelector('[data-testid="scatter-graph"]');
  if (!chart) return null;

  const viewport = viewportSize();
  const chartRect = chart.getBoundingClientRect();
  // Cheap bail-out. This runs on every scroll event (the chart usually starts
  // below the fold), and the full scan is a layout read per point — so reject
  // an off-screen chart with one rect read instead of a hundred.
  if (
    chartRect.bottom <= 0 ||
    chartRect.top >= viewport.height ||
    chartRect.right <= 0 ||
    chartRect.left >= viewport.width
  ) {
    return null;
  }

  const eligible: { element: SVGGElement; hasTrace: boolean; distance: number }[] = [];
  const chartCx = chartRect.left + chartRect.width / 2;
  const chartCy = chartRect.top + chartRect.height / 2;
  // Zooming pushes points outside the plot, where a clip path hides them —
  // but they keep a perfectly ordinary bounding box, so the viewport check
  // alone would happily point at one the user cannot see.
  //
  // This has to be the clip region, NOT the SVG's own box: the box includes
  // the 60px axis gutters, so a zoomed point parked over the y-axis labels is
  // painted away yet still inside the SVG. `plotBounds` returns null only when
  // the chart clips nothing, in which case the SVG box is the honest answer.
  const svg = chart.querySelector('[data-testid="d3-chart-svg"]');
  const plot = (svg && plotBounds(svg)) ?? svg?.getBoundingClientRect() ?? chartRect;

  for (const element of document.querySelectorAll<SVGGElement>(AGENTIC_POINT_SELECTOR)) {
    if (!isRendered(element)) continue;
    const rect = element.getBoundingClientRect();
    if (!isAnchorOnScreen(rect, viewport)) continue;
    if (!isAnchorWithin(rect, plot)) continue;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    eligible.push({
      element,
      hasTrace: element.dataset.hasTrace === 'true',
      distance: (cx - chartCx) ** 2 + (cy - chartCy) ** 2,
    });
  }

  if (eligible.length === 0) return null;

  const withTrace = eligible.filter((c) => c.hasTrace);
  const pool = withTrace.length > 0 ? withTrace : eligible;
  const chosen = pool.reduce((best, c) => (c.distance < best.distance ? c : best)).element;

  // Point at the marker, not at the group: a `.dot-group` also contains the
  // hit area and (when labels are on) the C=/DEP text above the dot, so its
  // bounding box centre can sit well off the dot itself. Eligibility is still
  // decided on the group, which is what carries opacity and pointer-events.
  return chosen.querySelector('.visible-shape') ?? chosen;
}
