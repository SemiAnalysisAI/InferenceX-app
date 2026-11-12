# D3 Chart Design Rationale

## Router-aware framework labels

Inference line labels and legends use `router_name` from each point's runtime
metadata. Plain `sglang` or `vllm` with router `smg` displays as `SMG SGLang`
or `SMG vLLM`. If any point uses SMG, the entire curve's line label and legend
use the SMG framework name without a mixed-name suffix. Curves with no SMG
points keep the standard name, and point tooltips use only that point's
metadata. This applies to official results and unofficial overlays.
Hardware keys, framework filters and measurements do not change.
The inference Views API uses the same helper for series and table labels.

## Desktop legend alignment

The shared chart wrapper places the desktop legend 8px below the plot's top
guideline, using the same top margin as the SVG renderer. Below the `lg`
breakpoint, the legend stays below the chart with its existing 12px gap.
Official and unofficial series share this layout. This is presentation-only;
API responses, filters, and `inferencex-skills` contracts are unchanged.

## Sidebar legend

Every chart sidebar uses `ChartLegend` with `variant="sidebar"` and the same
configuration as `/infx/historical`. Line charts pass each series' stroke dash as
`lineDasharray` (`'none'` for solid lines), so the swatch is a line even when
the chart also draws markers. Toggleable items get `onClick`, `onItemRemove`
and a `reset` whose button is disabled while nothing is hidden. Hidden items
sort to the bottom. Swatches stay dots only where a series has no line: bar
charts, scatter points without a connecting line (the normalized OperatorX
roofline) and static category keys. Grouped GPU legends (`GPUGraph`, PowerX
run comparison) keep their row order with `disableActiveSort`, and embedded
charts with minimal chrome pass `readOnly`.

The expanded panel is capped at 384px below `lg` and 575px from `lg` up. The
series list absorbs overflow first. The display controls (switches, the
Advanced section and key indicators) scroll inside their own region, capped at
the panel limit minus 6rem, so expanding Advanced never pushes a switch past the
panel border and the toolbar plus at least one series row stay visible.

Line swatches are behind `SERIES_LINE_PATTERNS` in
`lib/charts/framework-dash.ts`, which is currently `false`. While it is off,
`ChartLegendItem` ignores `lineDasharray` and every legend shows dot swatches.
Only the swatch shape changes, so reset, toggling, hover ✕, hidden sorting and
collapse behave the same.

## Framework line patterns

`frameworkDasharray(hwKey)` gives each serving framework its own dash pattern
(vLLM solid, SGLang dashed, TRT-LLM dotted, Dynamo long-dash variants) on the
inference scatter, chip comparison and historical trend lines. The canvas
paint and PNG export copy the SVG dash. Bar charts and uBenchX use colour only.

The patterns follow the same `SERIES_LINE_PATTERNS` switch. It is off by
default, so the helper returns no dash and every series line is solid. Set it
to `true` to restore both the framework patterns and the line swatches.

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
measures caption, legend and source-footer space, then gives the remaining height and
width to the plot. The legend wraps in rows below the plot, so the plot keeps the
full frame width. Long captions can grow the complete frame proportionally.
Tall bar charts keep the frame width instead. When row labels would overlap at
the ratio height, the frame grows taller so rows keep their live height. The
canvas stays within 10,000 px tall and 4096×4096 px of area (the Mobile Safari
limit), so the capture scale drops from 2× to as low as 0.5× first. Rows squeeze
only past that cap. Charts that fit stay at the exact ratio.
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

Price tables keep horizontal scrolling on the live page. In the PNG clone,
their scroll viewport is removed and cells may wrap to fit the capture width,
so Auto, 16:9, and 1:1 images include every price without a scrollbar.
This is presentation-only; API data and skills contracts are unchanged.

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

Pinned point details reuse the compact hover card's KV cache bar, including the
chip/CPU split and theoretical marker, as one thin bar with its label and total on the
same row. TRT-LLM's combined rate stays a single
segment; disabled offload does not contribute CPU hits. Missing chip measurements
retain the available textual rates instead of inventing a bar. Precision joins the
engine in the header, and deployment, chip count, parallelism and concurrency share one
line (`Single-node aggregate · 8 chips · DEP8 · conc 64`). Disaggregated points group
Prefill/Decode configurations by role with compact labels such as DEP4. There is no raw
configuration table.
Prompt/generated token counts use a thin proportional bar with
exact counts in one legend line; partial or invalid counts do not produce a split.
Official, unofficial and historical points
share this presentation; unofficial colors retain their per-run identity.
This is presentation-only: benchmark values, API responses and `inferencex-skills`
contracts are unchanged.

Chip-history/date-comparison graphs use the same compact hover card as the main
scatter chart. Hover preserves the comparison date/run label and any carried-forward
source date; swatches and cache bars use the corresponding curve color. Clicking
opens the full point details panel. Unofficial history points use compact hover too, while
retaining the unofficial warning, branch identity and per-run color. These are
presentation-only changes with no API or `inferencex-skills` contract changes.

Tooltips are built as HTML template literal strings, injected via D3's `.html()`. Using React elements would require:

1. `ReactDOM.render()` inside a D3 event handler (breaks React's lifecycle)
2. Or lifting tooltip state to React (causes re-render cascade on every mousemove)

HTML strings bypass React entirely. D3 writes them into a tooltip div that is portaled to `document.body` and positioned with `position: fixed`. This keeps tooltip updates at <1ms per frame.

Wrap tooltip HTML with `chartTooltipShell(body, options)` from `src/lib/d3-chart/tooltip-shell.ts` (or put `chartTooltipShellStyle(options)` on your own wrapper) instead of writing the popover background, border, radius, padding and shadow inline. Options cover pinned text selection, a custom border, min and max width, pointer events for links, and scrolling for long content. `chartTooltipTitle(label, color?)` renders the heading with a series dot, and `chartTooltipDismiss(text)` renders the pinned hint.

Beside a desktop legend, pinned details take the legend's slot at the legend's
width and the plot's height; elsewhere they are capped at 24rem. Longer details
scroll between a fixed header (warning, title and close button) and a fixed
action row, so links such as the run, charts and logs stay visible and pinning a
point never grows the chart row. The latency table shows median and P90 only. This is presentation-only with no API or
`inferencex-skills` contract changes.

Pinned details close on clicks outside the chart SVG, the tooltip and the
details panel, or on Escape, in desktop and mobile layouts. The shared wrapper
listens in capture phase so outside controls that stop bubbling still dismiss the
details without losing their own action. Clicks and Escape inside a Radix popover
leave them open. Point switching and empty-plot dismissal remain owned by the
chart; links and controls inside the details remain interactive. Mobile bottom
sheets retain their backdrop and swipe dismissal. This applies to official and
unofficial points without changing data, API, or `inferencex-skills` contracts.

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

## Frontier views (Historical)

The Historical tab has three views built on the Pareto frontier (interactivity
against the selected metric) over every snapshot date: **Frontier**, **Compare**
and **Software gains**, beside Trend line and Improvement waterfall.
`src/components/trends/frontier-history-core.ts` computes everything once per
selection and is shared with `/api/v1/views/historical?chart=frontier`, so the
charts and the API cannot disagree.

### Data

On each date a configuration contributes the best of its full sweeps from the last
seven days, or its latest earlier full sweep, so a few bad nights do not dent the
curve while a regression that lasts a week still shows. A sweep with fewer than 60%
of the points of the configuration's median over its previous five sweeps is a
partial run (it stopped early) and is skipped. Series are chips (`groupBy=gpu`) or
vendors (`vendor`); the API also offers the legend's hardware and engine series
(`config`).

Ownership uses Pareto dominance without interpolation: a series owns interactivity
_x_ when its best measured value at _x_ or faster is the best, resolved at 48
log-spaced levels. Consecutive levels that change hands together form one overtake;
reigns under seven days are flagged `brief`. Comparisons between curves (lead bars,
software gain by interactivity, chapter peaks) instead read the drawn monotone
curves, since a sparse sweep would otherwise score an interactivity with its next,
much faster point.

### Chart

Axes span all dates, so the frontier moves instead of rescaling. Everything is drawn
in one custom layer whose `displayIdentity` is the date index, so scrubbing and
playback skip the data and metric phases.

- A vendor picker at the top (All, or one vendor) narrows Frontier, Software gains and
  Compare-by-chips to that vendor's chips, matching the API's `vendors=` filter.
- **Frontier** draws the pooled frontier of the chips on screen as one path whose
  stroke is a hard-stop gradient, one color per owner, so the line has exactly the
  geometry of the shading under it. Each owner gets one label, on its longest stretch.
- **Compare** and **Software gains** draw each selected series' own frontier. Chips
  use the high-contrast palette whenever several of one vendor can share the chart
  (they share a hue in the dashboard palette); vendors use their brand colors.
- Each curve's starting frontier (the first frontier when pooled, otherwise each
  series' first run) is drawn as a thin dashed line in its color dimmed, or neutral
  for several pooled owners. Its points are cut to the interactivity range the
  current curve spans, ending on the drawn curve at both edges, so it stays one
  smooth line. Hovering a starting curve names the chip (or vendor), configuration
  and serving image at the nearest point.
- Whenever a single curve is on screen (the pooled frontier, or one selected series)
  the ground under it is shaded in one flat shade of the theme's blue (`--secondary`,
  the same in light and dark). The shade also covers the ground slower than the
  slowest point, which that point dominates, so it meets the y axis; that stretch has
  a faint dashed edge. Only the current curve is shaded, so a regression never shows
  as covered ground. How the frontier grew shows through playback and the faded
  earlier points below.
- Every frontier point has a dashed ring; a point gets a solid ring when it beats the
  best earlier frontier by more than 1%. Hovering a point shows its configuration,
  concurrency, measurement date and serving image.
- Once the frontier moves past a point, the point stays as a small faded dot in its
  owner's color: every earlier point of the pooled frontier in Frontier, and of each
  series' own frontier in Compare and Software gains. Its hover marks it as an earlier
  frontier point.
- The frontier follows each configuration's latest full sweeps, so a re-run that
  measured lower replaces a better curve. A series whose frontier on the shown date
  covers at least 10% less area than its best so far (`frontierRegressions`) gets a
  `▼N%` badge on its line label, a note under the chart naming its best date, the
  largest drop and the serving image that changed, and the same note in the hover of
  its points and starting curve.

### Timeline and chapters

The date slider's track is split into chapters at each `frontierChapters` step (an
area change of at least 10%), colored by the series that caused it. Hover names the
cause from the data: a series entering, a configuration new to its frontier, a
serving-image change, a re-run, or a regression (naming the image the configuration
moved to when it changed). The line under the slider spells
out the current chapter and playback pauses on each one. The range input sits on top
of the segments with a transparent track, so they always line up with the thumb. The
timeline starts at the first date any series on screen has data
(`historyFromFirstData`). A collapsible table lists the measured points behind the
curves on screen, with configuration, concurrency and run link.

### Panels

The view's controls (vendor picker, Compare's Vendors/Chips switch, series pills, and
vendors that only have data at another precision) sit in the chart caption, after the
title, costs and notices. Each view's paired panels sit directly under the chart and
share one geometry (`frontier-panel-layout.ts`): the same height and margins, with
headers aligned through a CSS subgrid, so their x axes line up.

- **Compare**: lead bars show the leader-over-runner-up ratio at 12 interactivity
  buckets on log2 axes fixed across all dates (diverging with two series, with NA
  where only one reaches), and a timeline plots each series' frontier area
  (`frontierAreas`), indexed to the leader on the first date. Vendors with data only
  at an unselected precision are named with a one-click way to add it.
- **Software gains** holds the hardware constant: it always groups by chip and plots
  `softwareGains` (each chip's area over its own first-run area) over time, and
  `softwareGainByInteractivity` (current over first-run frontier at the 12 buckets)
  as grouped bars. A table under the panels lists the same ratios per selected chip,
  one column per bucket, with an Average column (`averageSoftwareGain`, the geometric
  mean of the ratios the chip reaches); it follows the playback date.
- Under the Software gains panels and table, a **gain rate** panel shows the derivative
  of Software gains, also grouped by chip.
  `softwareGainRates` turns each chip's gain into compounded growth per month over a
  trailing 30, 60 or 90 day window (needing half a window of history), plotted on
  log(1 + rate) so spikes and slow months share an axis. The x axis is the calendar
  date, with `commonSoftwareGainRate` (the all-chip median) dashed, or days since
  each chip's first run (`daysSinceFirstRun`), which lines chips up by age to show
  where gains saturate. A table gives gain so far, lifetime rate (`monthlyRate`),
  current rate, the median, chip-specific (rate minus median) and the peak rate.

The optional **Memes** switch is an easter egg: once per playback run, the first time
another vendor takes part of the curve from NVIDIA, a small meme card appears in the
top-right corner of the plot. Its component and `public/decorative/frontier-memes/`
asset load only after it is turned on, and it follows the easter egg testing policy.
Playback, shading and memes are presentation-only and have no API parameter.

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

The shared layers (`bars`, `horizontal-bars`, `points`, `error-bars`, `bar-labels`, `lines`, `rooflines`, `radar`) and the grid write through `writeAttrs`/`writeText`, which apply the same comparison to a whole attribute map per node. Axes are drawn by `renderAxes`'s own copy of the d3-axis algorithm (same join, keys, ordering, enter attributes and `__axis` bookkeeping), with every update write going through the comparison; transitions still use the d3 generator. A test pins its output to d3-axis byte for byte, including after a `customize` callback has replaced tick text with `tspan`s. Line and roofline `d` strings are cached per path on the projected coordinates, curve and defined mask (`layers/line-path-cache.ts`), so a pass whose geometry did not move skips building the path string.

When the data phase runs while zoomed, the zoom transform is re-applied right after the rebuild. The grid, axes and the layers whose zoom handler rewrites every scale-dependent attribute (bar, horizontal bar, point, error bar, line, bar label) are drawn with the zoomed scales up front, so the re-applied transform finds nothing to change. Rooflines, scatter, radar and custom layers still render with the base scales, since their zoom handlers either skip some nodes or receive scale-sensitive context. The proximity overlay is removed before `raiseInOrder`, so the raised marks are already at the tail and do not move.

## Build Only What Is Visible

Point labels default to off, so the scatter layer builds a `.point-label` only while labels are shown and removes it when they are hidden (`syncPointLabel`). Previously every point carried a hidden `text` and `tspan`, which is half of each point's subtree. A label built late takes the stacking slot it would have had if it had been built with its point. That slot is after the hit circle, the original shape and any theme marker, and before offload halos or shapes re-created for a new precision (`lib/d3-chart/layers/point-label-order.ts`). The orange-chicken marker uses the same slot when a point has no label. A new label is filled in while detached, so it lands as one DOM insertion.

Turning labels on builds one label per point, so that path avoids selector engines and live collections. `syncPointLabel` and the collision placement find a point's label by walking its element children (`childPointLabel`) and walk a label's tspans the same way, instead of `querySelector`, a d3 join or `children`. In jsdom those cost several microseconds per point, which made building every label slower than the old style flip on hidden labels.

Other passes skip work that cannot change anything. A point without an offload halo skips the halo join. The Pareto fade does not walk the chart's marks while the frontier is off and no fade was applied to that zoom group. Point-label collision placement runs only while labels are visible. The dot `transition` style is written once per dot.

A width change re-runs the data phase. `useResponsiveChartDimensions` applies the first change of a resize at once and collapses later changes into one per `RESIZE_COALESCE_MS` (100 ms), ending on the final width. A window or panel drag therefore renders about ten times a second instead of once per frame.

`D3Chart` without a `height` sizes itself from the container width (`defaultChartHeight`): 600 px from 640 px wide, and 1.2× the width, clamped to 380–600 px, below that. A `height` prop may be a number or a function of width. The x axis and vertical grid request at most one tick per 80 px of plot width, so a phone shows four labels where a desktop shows ten. Line-label pills are laid out in priority order. A pill that still collides after its vertical and mirrored nudges is hidden (`data-visible="0"`), and a plot narrower than 360 px keeps only the first three pills. Pill backgrounds cap OKLCH lightness at 0.68 so the white label text stays readable when the series colour itself is lighter.

## Canvas Point Layer

`ScatterGraph` draws its official points on one canvas instead of one SVG group per point (`canvas: ensureCanvasPointLayer` on the scatter layer, `lib/d3-chart/layers/canvas-points.ts`). Thousands of `.dot-group` subtrees were most of the chart's DOM, and every data, zoom and legend pass walked them. The layer keeps per-point state in typed arrays (positions, target and shown opacity, fade, shape, palette slot, halo slot) and repaints in one `requestAnimationFrame` after any change. Other charts, unofficial overlays, rooflines and line labels stay SVG. The scatter layer passes the factory in, and shared code (`layer-renderer.ts`, the tooltip hooks, export) finds a live layer through `canvas-point-registry.ts`, so charts that never draw canvas points do not ship the layer.

Everything a user sees matches the SVG it replaced. Points are drawn in the order a keyed d3 join would have left the DOM (`canvas-point-order.ts`, duplicates included), so overlapping points stack the same way. Opacity changes animate with the CSS `ease` curve over the same 150 ms, and coordinate transitions use the shared 300 ms cubic tween. The Pareto fade multiplies opacity by 0.2 like the `opacity(0.2)` filter. Offload halos are dashed strokes with the halo legend's radius and dash. Theme colours given as `var(--name)` resolve against the canvas's computed style, and a theme class change repaints every live layer.

Pointer input goes through one transparent `.dot-hit-area` path, the union of the interactive points' hit circles, so the cursor and event targets still follow the points. A uniform grid (`canvas-point-hit.ts`) answers which point is under the pointer. The last drawn interactive point within the hit radius wins, as the topmost SVG circle did, and hidden points never match. Point labels remain SVG text in `.point-label-anchor` groups, built only for visible points, so collision placement and label CSS are unchanged.

`raiseInOrder` keeps unofficial overlay markers (`.unofficial-overlay-pt`, `.unofficial-eval-point`) after the official hit targets (`.dot-group`, the canvas layer, `.point`). An overlay point drawn on or near an official point therefore takes the hover and click. The official point stays reachable wherever the two hit circles don't overlap. The canvas paint order is unchanged, since the SVG overlay markers already sat above the canvas points. In the SVG-dot charts (GPU comparison, evaluation) the overlay X now also paints above the official dot, the same as in the scatter chart.

PNG and SVG export still render real `.dot-group` elements through the SVG scatter path, in the live draw order. The old export cloned the live groups, so their child order and style order carried the chart's history. `restoreExportOrder` reproduces that history from what the layer tracked. A point whose shape type changed while it lived has its shape after its label, and a point that was faded before its first transition write keeps `filter` ahead of `transition`. A repeated key stays the fresh group the SVG join would have re-created.

Tests and Cypress read points from the layer element rather than the DOM. `.canvas-point-layer` exposes `scatterPoints()`, one snapshot per point with its datum, key, plot and client coordinates, opacity, interactivity, shape, colour, halo, fade, hover state, label and `data-*` attributes. `data-points-joined` counts joins that added points, so `.canvas-point-layer:not([data-points-joined="0"])` means points have rendered. Clicks and hovers are dispatched on `.dot-hit-area` at a point's `clientX`/`clientY` (`cypress/support/scatter-points.ts`).

## Huawei series identity

Huawei uses a shared amber/gold identity, separate from NVIDIA green, AMD red, Google blue and OpenAI purple. `HUAWEI_CHART_PALETTE` (including the `HUAWEI_CHART_COLORS` tokens) in `packages/constants/src/gpu-keys.ts` defines a darker amber for light canvases and a brighter gold for dark canvases. Both base colors exceed 4.5:1 contrast against the tested white and `#111214` reference backgrounds.

`getVendor` recognizes canonical Ascend keys, framework-suffixed keys and Huawei/Ascend display names. The shared normal, date and high-contrast generators retain this identity; multiple Huawei chips/configurations use related amber shades. High-contrast palettes reserve the amber band from other vendors when Huawei is present. OperatorX delegates to the shared generator instead of maintaining a local crimson override. uBenchX uses the same generator for Huawei marks, legend swatches and tooltips while retaining its existing GPU palette. Theme changes update display decoration without changing measurement coordinates.

These colors encode vendor identity, not a measurement. Sequential heatmap scales encode values and are independent of categorical vendor colors; official logo artwork is also separate. This is presentation-only: no API values, filters, hardware specifications or normalization references change.
