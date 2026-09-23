# D3 Chart Design Rationale

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

## In-Place Y-Value Mutation

Effect 3 mutates `datum.y` directly on D3-bound data:

```js
dotGroups.each(function (d) {
  d.y = resolveY(d);
});
```

This is an intentional React anti-pattern. D3's data binding means each DOM element holds a reference to its datum. Mutating the datum and re-applying transforms is 10x faster than D3's full enter/update/exit cycle because there's no DOM creation or destruction.

## Refs for Zoom Handler

The zoom handler runs on every mouse/touch event during drag. It reads scales, rooflines, and data from refs instead of closure variables because:

1. Re-attaching the zoom handler (to capture new closures) requires removing and re-adding D3's zoom behavior, which resets the zoom transform — users lose their zoom position.
2. Refs always point to current values. When Effect 3 updates scales for a new metric, the zoom handler automatically picks up the new scales on the next frame.

## requestAnimationFrame Throttling in Zoom

During zoom/pan, point repositioning (cheap: transform attr update) runs every frame. Grid and roofline updates (expensive: full path recalculation) are batched via rAF:

```js
if (!rafId) {
  rafId = requestAnimationFrame(() => {
    updateGridAndRooflines(lastTransform);
    rafId = null;
  });
}
```

This keeps zoom at 60fps while deferring expensive work. The `rafId` guard prevents queuing multiple frames. Pending rAF is cancelled on unmount to prevent updates on removed DOM.

## HTML Strings for Tooltips

Tooltips are built as HTML template literal strings, injected via D3's `.html()`. Using React elements would require:

1. `ReactDOM.render()` inside a D3 event handler (breaks React's lifecycle)
2. Or lifting tooltip state to React (causes re-render cascade on every mousemove)

HTML strings bypass React entirely. The tooltip div is a plain DOM element appended to `document.body`, positioned absolutely. This keeps tooltip updates at <1ms per frame.

## Pareto Front: 4 Directions

Different metrics need different "optimal" directions:

| Direction   | "Best" means   | Example metric                                                        |
| ----------- | -------------- | --------------------------------------------------------------------- |
| upper_right | High x, high y | (not currently used)                                                  |
| upper_left  | Low x, high y  | Interactivity chart: low latency (x), high throughput (y)             |
| lower_right | High x, low y  | Cost/energy chart: high interactivity (x), low $/M tok or J/token (y) |
| lower_left  | Low x, low y   | (not currently used)                                                  |

The metric registry declares whether higher or lower values are preferable. Chart definitions derive the concrete corner from that polarity and the chart's x-axis direction, which keeps the choice in data rather than rendering code.

## Power curves and optimal filtering

### Global Pareto highlights

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

The six measured-power metrics (average, prefill, decode, P75, P90 and percentage of TDP) draw a fixed upper power boundary across tested configurations. **Optimal Only** shows boundary points when on and all measurements when off, preserving curve geometry, axis domains and zoom. These views use no separate **Show all measurements** switch. The boundary describes power demand across the load sweep; energy-per-token metrics retain their lower-energy Pareto frontiers.

Modeled chassis power retains its existing behavior: **Optimal Only** on shows the minimum-power Pareto frontier, which can legitimately contain one point. Turning it off draws the upper power boundary. In that mode, the separate **Show all measurements** switch (`i_allpoints=1`) reveals off-boundary points without changing the curve.

Dividing watts by one hardware's positive, constant TDP preserves its boundary membership. A lower percentage across different chips is not, by itself, an energy-efficiency comparison. Historical rings remain attached to visible historical points.

Upper boundaries use monotone interpolation between unique-X vertices, including after zoom. Curves are grouped by hardware, precision and date, and additionally by run for unofficial overlays; unrelated dates and runs never share a curve.

**Perf Ruler** is available on all six measured-power axes in both chart views. It measures the ratio of the drawn upper-boundary values at the same X coordinate, using the rendered paths after zoom; clicking an off-boundary dot selects its series' boundary, clamped to the curves' shared X range. The ratio compares power or percentage of TDP, not energy efficiency. Optimal Only changes point visibility without moving the ruler. Hidden or removed curves cannot be measured, and changing either axis clears existing rulers. Modeled chassis power keeps its existing ruler restriction while showing an upper boundary; energy and other Pareto views retain their ruler behavior.

### Observed concurrency sweeps

`i_xmode=concurrency` is an observed-load view, not an optimization axis. It uses the exact positive `conc` values and a linear X scale. Valid metric-bearing load points remain visible even when saved Optimal Only or Best per SKU preferences are enabled; Pareto Frontier, gradient strategy labels, Perf Ruler and Replay are unavailable in this mode. Y-axis units and measured/modelled boundaries do not change.

`groupConcurrencySeries` groups straight-line segments by hardware, precision, topology (`pointTopologyKey`), recipe fingerprint, date, run and power-comparison variant. It never joins TP4 to TP8 or 4P/4D to 16P/16D. A group with repeated concurrency values, or points without run provenance, stays as markers instead of being reduced to an arbitrary average or envelope. Markers retain their original values and identities. These segments connect observations; they do not establish a hardware-controlled comparison or estimate untested loads.

Official and unofficial paths share this behavior. Concurrency history comparisons use `ScatterGraph` with independent run segments, not the performance-oriented `GPUGraph` path. Exact topology quick filters retain that topology's entire load sweep. Share URLs, tables and CSV exports preserve the selected `conc` coordinates.

## Gradient Roofline Labels

Parallelism strategies (TP4, TEP8, DPAEP4) color roofline paths with gradient stops and use one label per contiguous strategy segment. The reasoning:

- A roofline may have 8+ points with different strategies. Individual labels would overlap.
- Gradient coloring shows strategy territories: "this segment of the curve uses TP8, that segment uses EP4"
- Blend zones (5-20% of gap between label changes) create smooth transitions between strategies

The territory rule: each point "owns" the region ±50% to its neighbors. When adjacent points share a label, they merge into a single color band.

Measured-power gradient labels use the displayed upper-boundary points, with the same single-date restriction as other gradient curves. They describe configuration changes, not numeric slope or efficiency. A boundary with one configuration keeps a solid line and its configuration label. Unofficial overlays also use one label per contiguous configuration segment, while their strokes and labels retain the run color shown in the legend.

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

## Tooltip & Chart Wrapper Abstractions

Three higher-level abstractions sit above the raw D3 tooltip logic:

- **`useStickyTooltip`** (`src/hooks/useStickyTooltip.ts`) — Manages pin/dismiss state, position, and content for a single tooltip instance. Encapsulates the ref+state pattern from the Pin/Dismiss lifecycle above so individual chart components don't reimplement it.
- **`useChartTooltipHandlers`** (`src/hooks/useChartTooltipHandlers.ts`) — Wires mouse/touch events to a `useStickyTooltip` instance. Handles hover-follow, click-to-pin, and click-away-to-dismiss as a composable hook.
- **`D3ChartWrapper`** (`src/components/ui/d3-chart-wrapper.tsx`) — Shared container for D3 charts. Handles the SVG ref, resize observer, tooltip portal div, and cleanup. Charts pass a render callback instead of managing their own container lifecycle.

These exist because multiple chart types (scatter, GPU, bar) all need the same tooltip and container behavior. The abstractions prevent each chart from reimplementing the Pin/Dismiss lifecycle and resize handling.

## Dynamic Left Margin Measurement

D3 bar charts measure actual Y-axis label widths using a temporary SVG `<text>` element before rendering. Hardcoded margins truncate labels when GPU names get long (e.g., "GB200 NVL72 (Dynamo TRT, MTP) (FP4)"). The formula `max(80, ceil(measuredWidth * 0.6) + 12)` ensures labels always fit while maintaining a minimum margin for short labels.

## One Animation System per Property

Opacity animates via inline CSS `transition: opacity 150ms ease` (set on dots, rooflines, and labels in the render path); d3 `.transition()` is reserved for attributes CSS can't animate — the `data-update` entrance transitions on dot `transform` and roofline `d`. Never point both systems at the same property: a d3 transition re-writes the style every animation frame, and each write restarts the CSS transition, emitting `transitionrun`/`transitioncancel` per node per frame (a legend hover across a full chart used to produce tens of thousands of events per session, all of it also observed by PostHog's session-replay MutationObserver). Handlers like legend hover therefore write opacity **once** and let CSS do the animation.

Official coordinate transitions use one 300ms D3 tween for visible points and rooflines. Hidden
official marks snap directly to their final geometry and are excluded from the transition snapshot,
avoiding frame-by-frame writes for data the user cannot see. Unofficial overlays retain their
existing snap behavior. Replay passes a zero duration and remains frame-driven.

## Batched Label Measurement

Label loops that size a background rect to its text (`.ll-bg`/`.pl-bg`, point-label collision avoidance) must not interleave `getBBox()` with DOM writes — each read after a write forces a synchronous layout, turning N labels into N reflows. The pattern is two passes over the selection: write every label's text first, then measure every bbox (one forced layout for the whole batch), then write the rects. Same rule for `measureLegendRightInset`: it reads `getBoundingClientRect`, so it's skipped entirely when there are no known-issue annotations to place — it would otherwise run on every zoom frame.
