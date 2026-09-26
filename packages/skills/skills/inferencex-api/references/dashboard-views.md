# Dashboard read-only views

Use `/api/v1/views/*` for dashboard-calculated values. Read the deployed
[OpenAPI contract](https://inferencex.semianalysis.com/api/openapi.json) first:
these routes become available only after the corresponding app change deploys.
Do not assume an installed skill proves server availability.

## Capture and select

1. Resolve the view and missing selectors from the table below. Read `options`
   for static model, hardware, sequence and metric registries; use each specialized
   view's `options`, `configurations`, `workloads`, or raw run-list operation for
   data-dependent choices.
2. Build one public HTTPS GET URL using `URLSearchParams`, especially for JSON
   costs, commas, slashes, and run-specific comparison dates. No credentials are
   required. Unknown or repeated parameter names return 400.
3. Save the complete decoded response and capture sidecar using
   [public API capture](public-api-examples.md). Retain the resolved `params`,
   source run IDs, dates, pricing, missing values and omitted-point reasons.
4. Compare the returned selection with the request before interpreting values.
   A 204 video response means no published artifact is available; do not publish
   or ingest an artifact to satisfy a read request. HTTP errors are incomplete
   evidence, not an empty successful dataset.

These are raw API captures, outside the six formal CLI bundle families.
`inferencex verify` does not convert a view capture into a formal evidence bundle.
Example URLs (check deployed availability before use):

```text
https://inferencex.semianalysis.com/api/v1/views/options
https://inferencex.semianalysis.com/api/v1/views/inference?model=DeepSeek-V4-Pro&sequence=agentic-traces&optimal=false&best=false
https://inferencex.semianalysis.com/api/v1/views/first-token?model=DeepSeek-V4-Pro&caps=2,5,10&minInteractivity=150
https://inferencex.semianalysis.com/api/v1/views/profit-estimator?model=DeepSeek-V4-Pro&priceSource=custom&inputPrice=1&cachedInputPrice=0.1&outputPrice=1
```

## View selection

All paths below are relative to `/api/v1/views/`. The maintained exhaustive
query-key list is in the app's OpenAPI contract. The following groups explain
which controls belong together.

| View                            | Selection and calculation                                                                                                                                                                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options`                       | Static registries and defaults, JSON only. Data-dependent run/config choices come from their own views.                                                                                                                                                              |
| `inference`                     | Model, sequence, precisions, date/exact run, GPU/vendor/framework/deployment/spec/power filters; metric, xmode, xmetric, percentile, optimal/best/allPoints; TCO, custom costs/powers, pricing, unofficial runs, comparison dates/endpoints. JSON or CSV.            |
| `historical`                    | Model, sequence, target, metric, precisions, GPUs/vendors/frameworks/deployment, start/end, TCO and pricing. `extendToDate` labels synthetic extension, defaults to current UTC date. JSON or CSV.                                                                   |
| `calculator`                    | Model/sequence/run/date, precisions/GPUs, percentile, target/mode, token type, owning/renting cost, TCO, power budget, cost cap, hide-above-limit and public unofficial runs. JSON or CSV.                                                                           |
| `first-token`                   | Benchmark selection plus 1–8 positive TTFT caps in seconds, minimum interactivity, cost provider and token type. Shared dashboard winner selection.                                                                                                                  |
| `cache-reuse`                   | AgentX selection plus exact `config` from returned configurations. Cache-reuse curves retain official versus unofficial evidence.                                                                                                                                    |
| `profit-estimator`              | AgentX selection, comparison dates/runs, target, utilization, lab revenue share, list/OpenRouter/custom token prices, own/rent/custom chip costs, TCO and provisioned/modeled/compare power. USD/chip-hour.                                                          |
| `profit-estimator-per-gigawatt` | Same selectors; USD/GW-year basis and owning-cost default.                                                                                                                                                                                                           |
| `fleet`                         | Model/sequence/precision/GPUs, target/percentile, TCO/token type/cost provider, MW, input/output prices, ramp, cache discount, MTBI, recovery, horizon and metric. JSON or CSV.                                                                                      |
| `evaluation`                    | Model, task, date, precision and GPU selection; public unofficial runs remain separately labeled and independent of the official date cutoff. JSON or CSV.                                                                                                           |
| `reliability`                   | Rolling range, GPU selection and optional `asOf` date for reproducibility. JSON or CSV.                                                                                                                                                                              |
| `gpu-specs`                     | Full hardware properties or selected metric ranking; table/radar/bar are renderings of these values. JSON or CSV.                                                                                                                                                    |
| `overview`                      | Models, model/hardware row limits, hardware tier, engine, comparison mode and reference. JSON or CSV.                                                                                                                                                                |
| `rankings`                      | Ranking kind (model or chip), selected model/scenario and format. Use the exact values in OpenAPI.                                                                                                                                                                   |
| `compare`                       | GPU pairs, model/slug, scenario, tier selection and variant. JSON or CSV.                                                                                                                                                                                            |
| `operatorx`                     | Exact/default measured run, operator, precision, shape, backend, cluster, status, throughput/latency and zero-based table page.                                                                                                                                      |
| `collectivex`                   | Ordered run selection and suite; EP size/phase/modes/precision/operation/percentile/axis/SKU/backend/series; KV page size/x/y/pull/push/overlap ISL/series; swap direction/layout/metric/percentile/series.                                                          |
| `submissions`                   | Search, table sort/direction/offset/limit, weekly/cumulative chart, on-change cutoff and NVIDIA/AMD/total lines. Table search does not filter the independent submission-volume chart.                                                                               |
| `current-inferencex-image`      | Model, sequence, hardware, precision, speculation, node type, framework families and `asOf` for image age/release status.                                                                                                                                            |
| `gpu-metrics`                   | Required run, artifact, GPU indices, metric or correlation axes, statistics sorting, chart mode and interactive downsampling preference. Raw rows and statistics remain unsampled; live response is no-store.                                                        |
| `video`                         | Default VideoGenX dashboard: shared workload, deployment, axes, cost tier, API-price reference, optimal and hidden-hardware filters. `view=compare` adds published matched-case selection. Legacy run/artifact discovery/results/tradeoff remain explicit. No-store. |

### VideoGenX selection and coverage

With no `run`/`artifact`, `/api/v1/views/video` returns the current dashboard's
published-history projection, not CI discovery. Copy its URL selectors directly:
`v_x`, `v_y`, `v_tier`, `v_optimal`, `v_api`, `v_hidden`, `v_base`, `v_cand`, `v_case`.
`v_view=chart|table` is presentation only. Read resolved `params`; malformed values
use the same defaults as the UI. Unknown/repeated query names still return 400.

- Defaults: P90 seconds vs videos/USD TCO, owning tier `h`, optimal deployments
  only; `r` selects renting. `v_optimal=0` includes dominated deployments. Queued
  client-concurrency cells stay in evidence, outside chart/table.
- `v_hidden` is a comma-separated roster-key list (for example `h100,mi355x`),
  default empty. It filters chart/table only; KPI/Compare/Evidence keep their
  original scope. Unknown keys are ignored, remaining keys are sorted/deduplicated.
- Metrics use participating GPUs. API list price is USD/video-second multiplied
  by clip duration, not TCO, revenue or measured power. `metricDefinitions`
  declares units and optimization direction; missing values remain null.
- The server reads the same first **five published history pages at most** as the
  UI. `coverage.pagesRead`, `coverage.nextPage` and `coverage.truncated` describe
  the inspected window; this is not all-history or date-range coverage. It applies
  the UI's canonical workload selection, sample floor and newest-cell rules.
- Default mode leaves `comparison.cases.status=not-requested`. `view=compare`
  reads at most two already-published media artifacts and returns the matched
  pair selected by `v_case` (zero-based), `resolvedCaseIndex`, pair count and
  unmatched counts. `not-published`, `no-pair` and `unavailable` are explicit
  alternatives to `ready`; `no-pair` means a missing baseline/candidate.
  `ready` means both artifacts were read, not that a matched case exists: always
  inspect `count` and `selected` (they can be 0 and null).
  Returned media paths are relative; private asset URLs and raw bundles are omitted.
- Use `view=discovery&page=1` for the prior CI listing. `run=…&artifact=…` retains
  the legacy result/serving/fidelity contract; `view=results|tradeoff` is explicit.
  Legacy selectors and `v_*` selectors cannot be mixed. Legacy missing artifacts
  return 204; dashboard mode returns its empty/partial projection and coverage.

Example (check deployed OpenAPI availability first; no authentication or write):

```js
const url = new URL('https://inferencex.semianalysis.com/api/v1/views/video');
url.search = new URLSearchParams({
  view: 'compare',
  v_x: 'p50Latency',
  v_y: 'videosPerGpuHour',
  v_tier: 'r',
  v_optimal: '0',
  v_api: '0.08',
  v_hidden: 'mi355x',
  v_base: 'h200',
  v_cand: 'b200',
  v_case: '3',
}).toString();
const response = await fetch(url);
if (!response.ok) throw new Error(`Video view HTTP ${response.status}`);
const data = await response.json();
console.log(
  JSON.stringify({
    params: data.params,
    coverage: data.coverage,
    rows: data.rows,
    comparison: data.comparison,
    provenance: data.provenance,
  }),
);
```

Measured ratios and uncalibrated media similarity do not qualify visual quality,
energy claims or a causal compute/memory bottleneck. Preserve source IDs, seals,
execution/publication times and coverage alongside exported values.

## Interpretation and maintenance

Use positive safe run IDs written as plain digits (`1e3`, `0x10`, and `+5` are
rejected); run lists such as `unofficialrun` and `runs` take up to eight unique IDs.
Overlay run indices follow the input order after trimming whitespace and removing
duplicates. Preserve those indices when attributing results to a run.
`runId` selects an exact logical snapshot, not necessarily
newly measured producer rows. Comparison entries accept `YYYY-MM-DD` or
`YYYY-MM-DD~rRUN_ID`; `start` and `end` add the endpoints, not every intervening
day. Date-only comparisons select that day's exact logical snapshot; the primary
`date` selector remains an as-of cutoff. Historical `start`/`end` instead bound
source observations inclusively.
Public unofficial overlays must not be relabeled as official results.

For measured-power gauges, `optimal=true` keeps the chart's higher-power outer
envelope. `frontier.direction` describes that boundary; `metric.direction` retains
the optimization direction used by `best=true`. Interpret the envelope as a load
boundary, not evidence that those points are more energy efficient.

Fleet lifecycle defaults (ramp, cached-input percent, MTBI, recovery) follow the
dashboard's lifecycle panel; read the current values from `/api/v1/views/options`
rather than hard-coding them.

`costh` means owning and `costr` means renting; there is no `costn` provider.
Custom chip costs are USD/chip-hour, token prices USD/million tokens,
interactivity tok/s/user, and video costs USD/deployment-hour. Preserve the
response's resolved TCO, utilization, license share, topology and power basis.
Modeled and provisioned power are distinct. Missing measured evidence is not zero.
GPU chart projections preserve the existing renderer's missing-metric zero
fallback; use unsampled `rows` to distinguish absent optional sensor values.

Zoom, axis scale, theme, labels, report expansion, media playback and download
buttons are presentation state, not new datasets. AI-chart provider keys and
private prompts, feedback, local uploads and administrative mutations are not
public read projections. AgentX drilldowns use existing availability, aggregates,
histograms, request timelines, logs and server metrics operations.

For every new or changed non-sensitive public-facing data view, implement or
update its read-only API in the same PR. Reuse the UI's pure transforms, test
selector effects and source semantics, and update OpenAPI, the route catalog,
coverage inventory and this existing npm package. Hidden navigation and feature
flags do not make public data sensitive.
