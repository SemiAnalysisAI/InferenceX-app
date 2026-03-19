# D3 Chart Design Rationale

## Why 4 Effects in ScatterGraph

A single useEffect for all D3 operations takes ~500ms (React reconciliation ~200ms + full SVG rebuild ~300ms). Splitting into 4 effects makes the most common interaction — switching Y-axis metric — take ~100ms instead:

| Effect            | Trigger                | Cost   | What it does                                    |
| ----------------- | ---------------------- | ------ | ----------------------------------------------- |
| 1. Structure      | Mount, resize, theme   | ~5ms   | SVG skeleton, axes groups, defs, clip paths     |
| 2. Data render    | Data shape changes     | ~500ms | Full D3 join, bindpoints, rooflines, zoom setup |
| 3. Metric update  | Metric/scale selection | ~100ms | Reposition points in-place, rebuild rooflines   |
| 4. Display toggle | Legend/label toggles   | <20ms  | Opacity transitions only                        |

**The key insight**: Effect 2 depends on `dataIdentity` (a stable string hash of point keys), NOT on the `data` array reference. When users switch metrics, data points get new y-values (new array reference), but `dataIdentity` stays the same because the set of points hasn't changed. So Effect 2 skips entirely, and only Effect 3 runs.

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

| Direction   | "Best" means   | Example metric                                            |
| ----------- | -------------- | --------------------------------------------------------- |
| upper_right | High x, high y | (not currently used)                                      |
| upper_left  | Low x, high y  | Interactivity chart: low latency (x), high throughput (y) |
| lower_right | High x, low y  | Cost chart: high interactivity (x), low cost (y)          |
| lower_left  | Low x, low y   | (not currently used)                                      |

The direction is declared per-metric in `inference-chart-config.json`, not computed. This makes the roofline direction a data concern, not a rendering concern.

## Gradient Roofline Labels

Parallelism strategy labels (TP4, TEP8, DPAEP4) are rendered as gradient stops along roofline paths, not as individual text labels. The reasoning:

- A roofline may have 8+ points with different strategies. Individual labels would overlap.
- Gradient coloring shows strategy territories: "this segment of the curve uses TP8, that segment uses EP4"
- Blend zones (5-20% of gap between label changes) create smooth transitions between strategies

The territory rule: each point "owns" the region ±50% to its neighbors. When adjacent points share a label, they merge into a single color band.

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
