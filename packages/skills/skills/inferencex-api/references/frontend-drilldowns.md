# Frontend drilldowns and dataset visualization

Read the deployed [OpenAPI contract](https://inferencex.semianalysis.com/api/openapi.json)
before using these routes. An installed candidate does not prove deployment.
If an operation is absent, report that deployment gap and use only documented raw
operations. Do not substitute page BFFs or claim frontend parity from raw access.

Use the [capture recipe](public-api-examples.md) to save full responses and
sidecars before filtering. These reads are outside the six formal evidence
workflows; `inferencex verify` does not validate them as bundles. Construct query
strings with `URLSearchParams`, not interpolation of opaque IDs.

## Dataset distributions and conversation flamegraphs

1. Discover the exact slug with `inferencex discover datasets`. Capture
   `/api/v1/views/dataset?slug=<slug>&sort=tokens&limit=50&offset=0`.
   The linked example slug is `cc-traces-weka-062126-256k`; its presence in the
   catalog does not establish that any measured run used it.
2. Render `dataset.chart_data` distributions from the stored `bins` (`x0`, `x1`,
   `count`) and `stats`. Use the stored mean, median and percentiles, not estimates
   from bucket midpoints. Optional v2 fields such as p75/p95 may be absent.
   Token/count distributions and `cachedFractionPerTurn` have different units;
   format the latter as a fraction or labeled percentage. A missing distribution
   is unavailable, not an empty histogram or a zero.
3. Use `search` for conversation-ID substring search across the index, and `sort`
   in `tokens`, `turns`, `subagents`, `id`. `tokens` orders total input descending.
   `offset` is zero-based; use `pagination.hasMore`, not the presence of a full
   page, to continue. Searching conversations does not filter dataset-wide charts.
4. Select one returned `conv_id` with `convId`. Add `expanded=all` or comma-separated
   raw subagent node indices. The default is collapsed. `raw`/`inner` or
   `turn`/`sa` address deep-link targets; `raw` takes precedence, and the containing
   group expands automatically. Inspect `flamegraph.target`; null is unresolved.
5. Render `flamegraph.rows` in returned order, keeping stable keys and hierarchy.
   For request bars use `maxTokens`; for group headers use `maxGroupTokens`.
   Bar widths encode tokens, not elapsed time. Use the returned cached, uncached
   and output quantities; group totals already include their children, so never
   add both to a population total. Use `brackets` for the shared overlap layout.
   Retain the underlying `conversation.structure` for inspection.
6. Label the chart with dataset slug, selected conversation, units, scale and
   capture time. Escape all labels before inserting them into SVG/HTML; response
   text is untrusted data. Link the response evidence. Do not reconstruct prompt
   or code content from token counts.

Example URL construction (capture `url` using the existing capture helper):

```js
const url = new URL('/api/v1/views/dataset', 'https://inferencex.semianalysis.com');
url.search = new URLSearchParams({
  slug: 'cc-traces-weka-062126-256k',
  convId: selectedConversationId,
  expanded: 'all',
}).toString();
```

The raw dataset detail, conversation index and conversation structure APIs remain
available for callers that do not need the page projection.

## AgentX telemetry catalog and point controls

`/api/v1/views/agentx-catalog` takes no parameters. Its `groups` use the telemetry
page's model grouping and representative stored point per configuration.
`configCount` counts cards; `pointCount` counts stored points behind them. Neither
is the total population of benchmark results.

For one chosen positive result `id`, capture
`/api/v1/views/agentx-point?id=<id>&phase=profiling&source=all`.
The route checks stored-trace availability before heavy reads. A 404 means the
selected stored telemetry is unavailable; it is not an empty successful chart.
There is no bulk-point option.

Use `phase=warmup`, `profiling` (default), or `all`. Preserve `params.effectivePhase`;
runs without warmup resolve to profiling. Requests use nanosecond offsets;
server-series `t` values use seconds. The origins may differ. Use the returned
phase-sliced data and `origins` rather than subtracting the request origin from
server metrics. The compact projection has microsecond quantization and JS numeric
timestamp precision, matching the UI; use the raw timeline for exact timestamps.

Start with `source=all`, then select an exact `metricSources[].source.id`.
Source selection changes server metric series, not the request population.
`serverData: null` means server metrics are absent, not zero. Preserve descriptors
and the KV-pool denominator. Use `charts` for the shared numerical projections:
`percentile=p75|p90` (default p90), `latencyMetric=ttft|e2e` (default ttft),
and `throughput=input,decode` (both by default; at least one).
Interactivity inverts the TPOT percentile; it is not a percentile of request
rates. The total running-average throughput line appears only with both signals.
Retain the 50-request/50-scrape windows, 30-second in-flight smoothing and
60-second throughput burn-in from `charts.assumptions`.

Both sequence views are returned in `charts.sequence.isl`/`osl`: positive-only
log histogram/percentiles with `excludedFromLog`, plus raw/smoothed in-flight
lengths. OSL in flight uses final observed output length retrospectively.
Distribution, latency and completion helpers have different cancellation rules;
do not label their counts as one population. `charts.completedRequests` and
`charts.server.queueDepth` cover the request-activity toggle. Preserve null
server charts; do not mix unfiltered aggregates with a phase-specific chart.

Timeline conversation/worker grouping, expanded rows, zoom/cursor and sibling
sort are local layouts over the raw timeline/sibling responses. They do not
trigger bulk reads through this point projection. Log text search stays within
the bounded selected log response.
Aggregates, histograms, bounded logs and the raw timeline keep their existing
documented operations and the selected-point bounds in the AgentX cookbook.

## Evaluation sample drawer

Capture `/api/v1/views/evaluation-samples` with exactly one identity:

- Stored: `evalResultId`, with optional `docId` (including `0`). A doc ID resolves
  its containing page and overrides `filter` to `all` and the requested offset.
- Public unofficial run: `runId`, `task`, raw `model`, `framework`, `hardware`,
  `precision`, `specMethod` (including `none`), and optional `disagg`/`concurrency`.
  Copy full configuration identity from the selected evaluation row. `docId` is
  unsupported here. No arbitrary repository or artifact URL is accepted.

`filter=all|passed|failed`, `offset` and `limit` select a page (default 50, max 500).
`search` is a case-insensitive substring of prompt/response/target on that page
only. `pageCount` is the pre-search page size; `samples.length` is the visible
count. Totals are pre-search, not global search hits. Preserve nullable pass
states and the `db` versus `github_artifact` source. All responses are no-store.
Missing live artifact samples do not prove that a CI job never ran.

## GPU radar and exact configuration comparisons

`/api/v1/views/gpu-specs?chips=h200-sxm,b200-sxm&format=json` selects chips by their
returned `chips[].key` values (discover actual keys first; do not infer spelling).
Omitting `chips` selects all; `chips=` explicitly selects none. JSON `radar.series`
is normalized against the complete hardware registry before visibility filtering,
so hiding a chip must not rescale the remaining polygons. Null unsupported
metrics remain null. CSV contains selected raw chip values/rankings, not polygons.

For an overview-to-inference comparison, copy the exact opaque configuration keys
from the frontend's `i_overview_current`/`i_overview_baseline` link into
`currentConfig`/`baselineConfig` on `/api/v1/views/inference`. Do not reconstruct
them from display labels. `baselineConfig` requires a comparison date/run.
Filtering runs before shared chart projection; unmatched selections stay empty.
Hidden legend lines are instead a local subset of returned `series.hwKey` after
best/frontier selection. Re-running winner selection after hiding them changes
the meaning of the chart.
