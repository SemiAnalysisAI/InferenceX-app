# D3 Chart Design Rationale

## Desktop legend alignment

The shared chart wrapper places the desktop legend 8px below the plot's top
guideline, using the same top margin as the SVG renderer. Below the `lg`
breakpoint, the legend stays below the chart with its existing 12px gap.
Official and unofficial series share this layout. This is presentation-only;
API responses, filters, and `inferencex-skills` contracts are unchanged.

## PNG export aspect ratio

Inference charts keep the title above the plot and place cost controls, pricing
assumptions, attribution, and the deployment notice below the plot and legend.
The shared `D3Chart` / `D3ChartWrapper` `footer` slot keeps this context inside
the chart's export root. PowerX retains its existing header layout.

The inference footer omits the optimization note and prefix-cache navigation
link. The complete ATOM disclaimer lives in the exportable chart footer whenever
a selected official or unofficial series uses ATOM, including history comparisons.
It appears below the plot in Auto, 16:9, and 1:1 PNG exports. Hidden ATOM series
do not add the disclaimer.

The download popover offers Auto, 16:9, and 1:1 for PNG export only. Auto retains
the existing image dimensions. Fixed ratios lay out an offscreen clone at a
1280×720 or 1000×1000 CSS-pixel frame (captured at 2× resolution). The exporter
measures caption and source-footer space, then gives the remaining height and
width to the plot. Long captions can grow the complete frame proportionally.
The chart rebuilds axes, grids, points and curves using copied visible scales,
without stretching a bitmap or adding letterbox bars. Text and mark sizes stay
constant; official points and unofficial overlays use the new coordinates.

Each D3 SVG registers a clone renderer. Export copies D3 bindings before keyed
joins and namespaces SVG IDs to keep clipping/gradients independent of the live
chart. Export decorations use `onExportRender`, never a callback that updates
live-chart refs. Auto keeps the previous capture path.

The choice stays local to each download menu. It does not resize the live chart,
change benchmark data or share links, or affect CSV and MP4 export. The
presentation-only choice has no read-only API parameter.

PNG and replay MP4 link footers resolve background, foreground, and font from
the active export context rather than choosing a separate light/dark palette.
The footer retains the originating hostname and route and fits long links to
the output width. This is presentation-only; API responses, skills, and benchmark
data are unchanged.

## Cost controls in the caption

Inference and historical charts place TCO Basis immediately after Cost Tier
below the graph. The model/scenario, cost-metric and visible-TPUv7 gates apply
to official data and unofficial overlays. The shared caption field exports the
selected basis as text; embedded charts do not expose interactive controls.
This placement is presentation-only: `tcoBasis`, API responses, defaults and
calculations are unchanged.

## Four Invalidation Phases

One effect for every D3 operation takes roughly 500ms (React reconciliation ~200ms plus a full SVG update ~300ms). `D3Chart` separates structure, stable-identity data joins, metric coordinates, and display decoration. The most common interaction, switching the Y-axis metric, then takes roughly 100ms:

| Effect            | Trigger                | Cost   | What it does                                    |
| ----------------- | ---------------------- | ------ | ----------------------------------------------- |
| 1. Structure      | Mount, resize, theme   | ~5ms   | SVG skeleton, axes groups, defs, clip paths     |
| 2. Data render    | Data shape changes     | ~500ms | Full D3 join, bindpoints, rooflines, zoom setup |
| 3. Metric update  | Metric/scale selection | ~100ms | Reposition points in-place, rebuild rooflines   |
| 4. Display toggle | Legend/label toggles   | <20ms  | Restyle marks or redraw changed decorations     |

**The key insight**: The data phase depends on `dataIdentity`, a stable string built from point join keys, rather than the `data` array reference. Metric changes produce new `x`/`y` values and a new array, but the set of points stays the same. The metric phase mutates bound coordinates by key and skips enter/update/exit joins.

Custom layers that own scale-neutral decorations declare a `displayIdentity` and an `onDisplayUpdate` callback. The renderer snapshots each identity after the data and metric phases, then reruns only the custom layers whose identities changed. This removes stale labels and decorative overlays without rebuilding joins, scales, or unrelated paths. Callbacks receive the current zoomed scales so toggles do not jump decorations back to the unzoomed frame.

`ScatterGraph` further partitions Effect 4 because its controls have disjoint mutation scopes. Mark visibility, palette/shape, trace metadata, point-label visibility/collision, line-label placement, and known-issue annotations each have a dedicated layout effect. It deliberately omits the generic scatter `displayIdentity`: point-label toggles update only `.point-label` nodes, while the unofficial overlay layer's own display callback updates only `.overlay-label` nodes. Recombining these passes causes label toggles to restamp thousands of unchanged shape, visibility, and trace attributes.

## In-Place Datum Mutation

Effect 3 copies each point's new values onto its D3-bound datum by join key (`Object.assign(bound, next)` in `updateLayerForMetric`), then re-applies transforms.

This is an intentional React anti-pattern. D3's data binding means each DOM element holds a reference to its datum. Mutating the datum and re-applying transforms is 10x faster than D3's full enter/update/exit cycle because there's no DOM creation or destruction.

## Refs for Zoom Handler

The zoom handler runs on every mouse/touch event during drag. It reads scales, rooflines, and data from refs instead of closure variables because:

1. Re-attaching the zoom handler (to capture new closures) requires removing and re-adding D3's zoom behavior, which resets the zoom transform — users lose their zoom position.
2. Refs always point to current values. When Effect 3 updates scales for a new metric, the zoom handler automatically picks up the new scales on the next frame.

## requestAnimationFrame Throttling in Zoom

During zoom/pan, point repositioning (cheap: transform attr update) runs on every zoom event. Axis, grid, and roofline updates (expensive: full path recalculation) go through `createZoomFrameBatcher`, which keeps at most one frame queued and runs only the latest transform's work.

This keeps zoom at 60fps while deferring expensive work. Effect cleanup cancels a pending frame so it never updates removed DOM.

## HTML Strings for Tooltips

Tooltips are built as HTML template literal strings, injected via D3's `.html()`. Using React elements would require:

1. `ReactDOM.render()` inside a D3 event handler (breaks React's lifecycle)
2. Or lifting tooltip state to React (causes re-render cascade on every mousemove)

HTML strings bypass React entirely. D3 writes them into a tooltip div that is portaled to `document.body` and positioned with `position: fixed`. This keeps tooltip updates at <1ms per frame.

## Pareto Front Direction

The metric registry declares whether higher or lower values are preferable. Chart definitions derive the concrete corner from that polarity and the chart's x-axis direction, which keeps the choice in data rather than rendering code.

## Power curves and optimal filtering

### Global Pareto highlights

For machine-readable frontier and hinterland observations, see the
[Pareto frontier and hinterland reference](../packages/skills/skills/inferencex-api/references/pareto.md).
The server and chart share `src/lib/charts/pareto-frontier.ts`; their input-selection pipelines differ.

Inference scatter charts with a performance-preference X axis expose a **Pareto Frontier** switch under
**Advanced**, off by default.
Collapsing Advanced does not turn off an enabled highlight.
`i_frontier=1` preserves plain shading in share links; value `2` restores the scenic background.
The frontier pools the currently visible official
and unofficial observations across the selected series and dates, after hardware,
precision, quick filters and Optimal Only. It does not replace per-series curves.
While enabled, hardware series with no observation on the global frontier render
at 20% alpha, including their curves, points, labels and clipped continuations.
All observations of a frontier hardware series retain their normal styling, and
ties at a frontier coordinate keep every tied hardware series prominent.
The alpha filter composes with visibility and hover opacity; switching the
frontier off removes it. Official and unofficial marks use the same treatment.

The global dotted line connects non-dominated observations with straight segments
in rendered coordinates. Rings mark the observed vertices, including singleton
frontiers. Green shading extends beyond the frontier toward the best corner.
The line does not claim measured performance between observations.
The resolved axis directions determine the preferred corner,
including custom metrics, latency, cost and energy. Power uses lower power as the
preferred Y direction, separately from the existing upper load-sweep boundaries.

The toggle cycles: off → plain fill → off → scenic background → off →
plain fill. The frontier uses a sunny castle landscape with butterflies. The
scene is an original AI-generated decoration, not benchmark data or imagery from a game franchise.
Switching metrics retains the mode. Switching off hides the line and background.
The scene covers the full plot once (`xMidYMid slice`) at 30% opacity and is cut
off by the boundary path. It is not tiled or fitted to the shaded region. The
background stays fixed in screen coordinates while the boundary follows zoom.
The optimized WebP asset lives under `public/decorative/pareto/` and loads only when the
scenic mode is enabled.

These are SVG decorations, so exports include them. Their custom display layer
updates with visibility, log scales and zoom without taking point pointer events.
One-dimensional GPU, history and evaluation charts have no two-objective Pareto
region and do not expose this switch.

The six measured-power metrics (average, prefill, decode, P75, P90 and percentage of TDP) draw a fixed upper power boundary across tested configurations. **Optimal Only** shows boundary points when on and all measurements when off, preserving curve geometry, axis domains and zoom. The boundary describes power demand across the load sweep; energy-per-token metrics retain their lower-energy Pareto frontiers.

Dividing watts by one hardware's positive, constant TDP preserves its boundary membership. A lower percentage across different chips is not, by itself, an energy-efficiency comparison.

Upper boundaries use monotone interpolation between unique-X vertices, including after zoom. Curves are grouped by hardware, precision and date, and additionally by run for unofficial overlays; unrelated dates and runs never share a curve.

**Perf Ruler** is available on all six measured-power axes in both chart views. It measures the ratio of the drawn upper-boundary values at the same X coordinate, using the rendered paths after zoom; clicking an off-boundary dot selects its series' boundary, clamped to the curves' shared X range. The ratio compares power or percentage of TDP, not energy efficiency. Optimal Only changes point visibility without moving the ruler. Hidden or removed curves cannot be measured, and changing either axis clears existing rulers. Energy and other Pareto views retain their ruler behavior.

### Concurrency is not an x-axis

There is no concurrency x-axis mode. GPU count varies across configurations, so the same concurrency is not a comparable load between them; `conc` stays a point attribute in tooltips, tables, CSV and the API. Exact topology quick filters (`pointTopologyKey`) select allocation and parallelism without filtering concurrency.

## Axis Domains from Visible Data Only

D3 axis domains are computed from only the visible (non-hidden) data points. Using all points (including toggled-off GPUs) would leave large blank areas when most GPUs are hidden, wasting chart space. This means axes rescale when toggling GPUs — intentional behavior that maximizes data density.

## Zoom Transform Preservation

When Effect 2 rebuilds the SVG (data shape change), the current zoom transform is saved at the start and re-applied after rebuild. Without this, users would lose their zoom position every time comparison dates are added or overlay data loads.

## Tooltip Pin/Dismiss Lifecycle

1. **Hover**: Show tooltip + rulers, follow cursor
2. **Click**: Pin tooltip (freeze position, enable text selection + pointer events)
3. **While pinned**: Hover handlers disabled (prevents tooltip from jumping)
4. **Dismiss**: Click elsewhere, or zoom starts (via deferred rAF to avoid re-render during zoom event)

The rAF deferral on zoom-dismiss is critical — calling `setState` synchronously inside a D3 zoom handler causes React to re-render mid-zoom, creating visible jank.

## One Animation System per Property

Opacity animates via inline CSS `transition: opacity 150ms ease` (set on dots, rooflines, and labels in the render path); d3 `.transition()` is reserved for attributes CSS can't animate — the `data-update` entrance transitions on dot `transform` and roofline `d`. Never point both systems at the same property: a d3 transition re-writes the style every animation frame, and each write restarts the CSS transition, emitting `transitionrun`/`transitioncancel` per node per frame (a legend hover across a full chart used to produce tens of thousands of events per session, all of it also observed by PostHog's session-replay MutationObserver). Handlers like legend hover therefore write opacity **once** and let CSS do the animation.

Official coordinate transitions use one 300ms D3 tween for visible points and rooflines. Hidden
official marks snap directly to their final geometry and are excluded from the transition snapshot,
avoiding frame-by-frame writes for data the user cannot see. Unofficial overlays retain their
existing snap behavior. Replay passes a zero duration and remains frame-driven.

## Batched Label Measurement

Label loops that size a background rect to its text (`.ll-bg`/`.pl-bg`, point-label collision avoidance) must not interleave `getBBox()` with DOM writes — each read after a write forces a synchronous layout, turning N labels into N reflows. The pattern is two passes over the selection: write every label's text first, then measure every bbox (one forced layout for the whole batch), then write the rects. Same rule for `measureLegendRightInset`: it reads `getBoundingClientRect`, so it's skipped entirely when there are no known-issue annotations to place — it would otherwise run on every zoom frame.

## Write Only What Changed

Every `setAttribute`, inline-style write, `textContent` assignment, and node move produces a `MutationObserver` record, **even when the value is unchanged**. PostHog session replay (rrweb) serializes each record — a moved node is re-serialized with its whole subtree — and the agentic-point coach mark rescans on them. A throttled Chrome profile of a legend toggle attributed ~40% of the main-thread work to rrweb processing these records; most came from blind re-syncs of hundreds of point labels, decoration rings, gradient stops, and `.raise()` calls that were already in order.

Hot re-sync paths (data, metric, and display phases; zoom frames; point-label placement) therefore use the write-if-changed helpers in `src/lib/d3-chart/chart-update.ts`: `setAttrIfChanged`, `setStyleIfChanged`, `setTextIfChanged`, and `raiseInOrder` (sequential `.raise()` semantics, skipped when each parent's tail is already in that order). They compare against the live DOM, not a cache, so a label the placement pass moved is still restored correctly. Reads of attributes and inline styles never force layout. Initial enter-path construction can keep plain `.attr()` chains — new nodes produce one add record regardless. Tests for these paths assert a repeated pass emits zero mutation records.

## Huawei series identity

Huawei uses a shared amber/gold identity, separate from NVIDIA green, AMD red, Google blue and OpenAI purple. `HUAWEI_CHART_PALETTE` (including the `HUAWEI_CHART_COLORS` tokens) in `packages/constants/src/gpu-keys.ts` defines a darker amber for light canvases and a brighter gold for dark canvases. Both base colors exceed 4.5:1 contrast against the tested white and `#111214` reference backgrounds.

`getVendor` recognizes canonical Ascend keys, framework-suffixed keys and Huawei/Ascend display names. The shared normal, date and high-contrast generators retain this identity; multiple Huawei chips/configurations use related amber shades. High-contrast palettes reserve the amber band from other vendors when Huawei is present. OperatorX delegates to the shared generator instead of maintaining a local crimson override. ubenchX uses the same generator for Huawei marks, legend swatches and tooltips while retaining its existing GPU palette. Theme changes update display decoration without changing measurement coordinates.

These colors encode vendor identity, not a measurement. Sequential heatmap scales encode values and are independent of categorical vendor colors; official logo artwork is also separate. This is presentation-only: no API values, filters, hardware specifications or normalization references change.
