# Pitfalls & Lessons Learned

Non-obvious failure modes discovered during development. Each entry explains what breaks and why.

## Token Type Consistency

**Bug pattern**: Chart title says "Output Token Cost" but bars show total token cost.

When a UI has a Token Type selector (Total/Input/Output), **every** downstream value must use the selected type: chart title, bar values, table values, tooltips, sorting, comparison text, axis labels. The common mistake is updating the title and sorting but forgetting the tooltip or comparison banner.

**Fix**: Always use helper functions (`getThroughputForType()`, `getCostForType()`, `getTpPerMwForType()`) in every rendering path. Never access `result.costh` directly — go through the helper.

## Schema Evolution & "No Data Available"

**Bug pattern**: Adding a new metric field causes old data to show "No data available".

Guard checks like `if (metricKey in filteredData[0])` fail silently when historical data lacks the field. The check returns false → data is treated as empty → chart shows "No data available" instead of rendering with the field defaulting to 0.

**Fix**: Make new fields **optional** in types. Add runtime fallback (`computeXFields()` in utils.ts) applied in useChartData BEFORE filtering. Never check for field existence as a data presence test.

## Empty Object Truthiness

**Bug pattern**: `if (data) { renderChart(data) }` renders an empty chart.

`{}` is truthy in JavaScript. API responses that return empty objects pass truthiness checks but contain no data. Always check `Object.keys(obj).length > 0` for object emptiness.

## D3 Zoom Transform Loss

**Bug pattern**: User zooms in, then comparison data loads, chart resets to default zoom.

Effect 2 (data render) clears and rebuilds the SVG. If zoom transform isn't saved before rebuild and restored after, the user's zoom position is lost. Save `d3.zoomTransform(svg.node())` at the start of Effect 2, re-apply after setup.

## Stale Closures in D3 Event Handlers

**Bug pattern**: Tooltip shows outdated data after metric switch.

D3 event handlers capture variables from their creation scope. If a handler references `selectedMetric` from a closure, it holds the value at attachment time. After a metric switch, the handler still shows the old metric.

**Fix**: Read current values from refs, not closures. Refs are mutable pointers that always reflect the latest state.

## Disaggregated Config Metrics

**Bug pattern**: Cost per token is 2x too high for disaggregated setups.

Disaggregated configs (MoRI SGLang, Dynamo TRT) have separate prefill and decode GPU counts. Cost and throughput metrics must be calculated per decode/prefill GPU, not per total GPU count. The disclaimer in ChartDisplay.tsx explains this to users.

When adding metrics that involve per-GPU calculations, check if the config is disaggregated (`d.disagg === true`) and use the appropriate GPU count.

## Negative Spline Values

**Bug pattern**: Log-scale chart crashes with "domain must be strictly positive".

Cubic Hermite splines can overshoot, producing negative values between two positive data points (especially with sparse data or steep gradients). Log scales require positive values.

**Fix**: Clamp all interpolated values to `Math.max(0, value)` after spline evaluation.

## Axis Domains from All Data

**Bug pattern**: Chart has huge blank areas when most GPUs are hidden.

If axis domains are computed from all data (including hidden GPUs), the visible data occupies a small fraction of the chart area. Compute domains from visible data only, so axes rescale to fill the chart when GPUs are toggled off.

## Tooltip Re-render Cascade During Zoom

**Bug pattern**: Chart jitters during zoom/pan.

Dismissing a pinned tooltip inside a D3 zoom handler calls `setState`, which triggers React re-render during the zoom event. The re-render causes a layout shift that feeds back into the zoom handler.

**Fix**: Defer tooltip dismissal via `requestAnimationFrame`. The state update happens after the current frame completes, breaking the feedback loop.

## Comparison Date Stamping

**Bug pattern**: GPU comparison shows no data for comparison dates.

Date relabeling happens in `useChartData` (line 126, 131): comparison date rows get their `date` field overwritten to the _requested_ comparison date, and main rows get stamped with `selectedRunDate` when the user explicitly picks a date (because the materialized view query returns undated "latest" data). The `activeDates` toggle set matches rows against their `date` field — without stamping, rows would never match the toggle and comparison renders empty. The original DB date is preserved in `actualDate` (used by tooltips).

This relabeling is scoped to `useChartData` in the inference tab. Evaluation, reliability, and historical trends all use real DB dates unmodified.

## Hardware Config Ref Stability

**Bug pattern**: Chart re-renders every time any unrelated state changes.

`useChartData` memoizes the sorted hardware config using a deep comparison ref check: if the new `hwConfig` array has identical content to the previous one, the existing reference is returned unchanged. This prevents downstream `useMemo` hooks in `InferenceContext` and `ScatterGraph` from invalidating when the reference changes but the data hasn't. Removing or bypassing this ref check causes cascading re-renders through the entire inference rendering tree, including every tooltip and legend item, on every state update anywhere in the context.

## Cost Calculation Inheritance

**Bug pattern**: Custom user cost for H100 doesn't apply to H100-TRT variant.

`getGpuSpecs(hwKey)` strips framework suffixes from the hwKey to look up the base GPU entry in `GPU_SPECS`. User-provided cost and power overrides must therefore be keyed by the base GPU name (e.g. `h100`), not the full hwKey (e.g. `h100-trt`). If overrides are stored or applied against the full hwKey, variants that share the same physical GPU won't inherit the override because the base lookup finds the unmodified default entry.
