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

| View                            | Selection and calculation                                                                                                                                                                                                                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options`                       | Static registries and defaults, JSON only. Data-dependent run/config choices come from their own views.                                                                                                                                                                                                                |
| `inference`                     | Model, sequence, precisions, date/exact run, GPU/vendor/framework/deployment/spec/power filters; metric, xmode, xstat, xmetric, percentile, optimal/best/allPoints; equal-service sources/target, roleShare and powerFit; TCO, custom costs/powers, pricing, unofficial runs, comparison dates/endpoints. JSON or CSV. |
| `historical`                    | Model, sequence, target, metric, precisions, GPUs/vendors/frameworks/deployment, start/end, TCO and pricing. `extendToDate` labels synthetic extension, defaults to current UTC date. JSON or CSV.                                                                                                                     |
| `calculator`                    | Model/sequence/run/date, precisions/GPUs, percentile, target/mode, token type, owning/renting cost, TCO, power budget, cost cap, hide-above-limit and public unofficial runs. JSON or CSV.                                                                                                                             |
| `first-token`                   | Benchmark selection plus 1–8 positive TTFT caps in seconds, minimum interactivity, cost provider and token type. Shared dashboard winner selection.                                                                                                                                                                    |
| `cache-reuse`                   | AgentX selection plus exact `config` from returned configurations. Cache-reuse curves retain official versus unofficial evidence.                                                                                                                                                                                      |
| `profit-estimator`              | AgentX selection, comparison dates/runs, target, utilization, lab revenue share, list/OpenRouter/custom token prices, own/rent/custom chip costs, TCO and provisioned/modeled/compare power. USD/chip-hour.                                                                                                            |
| `profit-estimator-per-gigawatt` | Same selectors; USD/GW-year basis and owning-cost default.                                                                                                                                                                                                                                                             |
| `fleet`                         | Model/sequence/precision/GPUs, target/percentile, TCO/token type/cost provider, MW, input/output prices, ramp, cache discount, MTBI, recovery, horizon and metric. JSON or CSV.                                                                                                                                        |
| `evaluation`                    | Model, task, date, precision and GPU selection; public unofficial runs remain separately labeled and independent of the official date cutoff. JSON or CSV.                                                                                                                                                             |
| `reliability`                   | Rolling range, GPU selection and optional `asOf` date for reproducibility. JSON or CSV.                                                                                                                                                                                                                                |
| `gpu-specs`                     | Full hardware properties or selected metric ranking; table/radar/bar are renderings of these values. JSON or CSV.                                                                                                                                                                                                      |
| `overview`                      | Models, model/hardware row limits, hardware tier, engine, comparison mode and reference. JSON or CSV.                                                                                                                                                                                                                  |
| `rankings`                      | Ranking kind (model or chip), selected model/scenario and format. Use the exact values in OpenAPI.                                                                                                                                                                                                                     |
| `compare`                       | GPU pairs, model/slug, scenario, tier selection and variant. JSON or CSV.                                                                                                                                                                                                                                              |
| `operatorx`                     | Exact/default measured run, operator, precision, shape, backend, cluster, status, throughput/latency and zero-based table page.                                                                                                                                                                                        |
| `collectivex`                   | Ordered run selection and suite; EP size/phase/modes/precision/operation/percentile/axis/SKU/backend/series; KV page size/x/y/pull/push/overlap ISL/series; swap direction/layout/metric/percentile/series.                                                                                                            |
| `submissions`                   | Search, table sort/direction/offset/limit, weekly/cumulative chart, on-change cutoff and NVIDIA/AMD/total lines. Table search does not filter the independent submission-volume chart.                                                                                                                                 |
| `current-inferencex-image`      | Model, sequence, hardware, precision, speculation, node type, framework families and `asOf` for image age/release status.                                                                                                                                                                                              |
| `gpu-metrics`                   | Required run, file/host artifact, GPU indices, metric or correlation axes, statistics sorting, chart mode and interactive downsampling preference. DB-first raw-explorer projection; full-record statistics use stored digests. Not a serving-window/role-pool projection. Responses are no-store.                     |
| `video`                         | CI run/artifact discovery; only already-published artifact reads; source, serving cell, media/fidelity slot, power phase and GPU denominator; same-workload comparisons, axes, deployment costs and selected tradeoff point. No-store.                                                                                 |

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

Prefer equal-service comparisons for article-facing hardware analysis. Use
`xstat=mean` only for fixed-sequence service axes when that statistic is intended:
streaming speed then means **1 / mean TPOT**, not arithmetic mean request speed.
TTFT/E2E use recorded means. Default is median; absent means are not replaced.
AgentX still uses `percentile`; concurrency uses no statistic. Check resolved
`params.xstat` and `xAxis.statistic`, not the requested parameter alone.

`serviceCompare=true` returns exact opaque `serviceSources` keys, an
`equalServiceCurve`, and an optional `equalServiceComparison` at `serviceTarget`.
Use returned keys verbatim for `serviceBaseline` and `serviceComparator` via
`URLSearchParams`; never substitute bare GPU names. Each `label` is display text
(hardware and date, plus precision, topology or run only where two sources would
otherwise look alike); select and join by `key`, never by label. Omitted keys select the first
two sources; unknown explicit keys stay unavailable. Omitted target means no
selected-target result. Targets are tok/s/user for streaming speed, seconds for
TTFT/E2E. Concurrency is unsupported for equal-service interpolation.

The same dashboard helper uses scoped observed points before frontier/best
pruning, with no power-comparison clones. It interpolates raw quantities
linearly only inside each exact source range, then reports signed
`100 × (comparator / baseline − 1)`. Metrics are measured GPU W/GPU,
whole-deployment output tokens/s, and validated GPU J/output token. Negative energy
change means lower comparator energy. Preserve bracket endpoint identities,
`interpolated`, missing reasons and nulls. Never call interpolated points new
measurements or bridge different runs, recipes, topologies or missing endpoints.

`serviceCompare=true` also returns `matchedConcurrency`: the two selected sources
paired at each concurrency either observed. Sides are `observed`, `missing`, or
`ambiguous` (disagreeing duplicates, none chosen); `changePercent` needs both
observed. It is a same-load diagnostic: speeds usually differ, so never present it
as an equal-service result.

`roleShare=true` returns validated disaggregated prefill/decode J/output and their
shares of reconstructed total energy. It converts prefill J/input using the
same-window aggregate J/output-to-J/input ratio; it does not compare unlike token
denominators. Missing roles are omitted. `rolePoints` adds per-observation role
W/GPU, role-local J/input and J/output (different denominators, never add them)
and the output-token reconstruction, with nulls for missing figures.

`powerFit=true` returns `powerFits`: per source, an OLS line of measured mean W/GPU
against output tok/s per allocated GPU, with `P₀`, slope `m` (J/output token), R²,
n, x-range, registry `tdpWatts` and point identities. Fewer than three distinct
rates return `fit: null`, `reason: "too-few-points"`. Call `P₀` an extrapolated
intercept, not idle power, and do not read the line outside its x-range.

These panels require JSON; enabling any with CSV returns 400. Existing CSV remains
a plotted-point export.

For exact-load comparisons, use `xmode=concurrency`. The response resolves
`optimal=false` and `best=false`, retains every eligible observed load, and sets
`frontier.direction=null`; concurrency is not a speed or quality preference.
Filter `topologies` with one or more exact `point.topologyKey` values from a first
response (encode with `URLSearchParams`). This selects the same GPU count,
parallelism, role-pool split and offload mode across hardware without removing
loads. Unknown metadata stays unknown, not equivalent to an explicit setting.
Keep hardware, precision, recipe, run/date and software provenance separate;
matching topology alone does not establish a controlled hardware comparison.
Missing concurrency points must remain absent, not interpolated or extrapolated.

Fleet lifecycle defaults (ramp, cached-input percent, MTBI, recovery) follow the
dashboard's lifecycle panel; read the current values from `/api/v1/views/options`
rather than hard-coding them.

`costh` means owning and `costr` means renting; there is no `costn` provider.
Custom chip costs are USD/chip-hour, token prices USD/million tokens,
interactivity tok/s/user, and video costs USD/deployment-hour. Preserve the
response's resolved TCO, utilization, license share, topology and power basis.
Modeled and provisioned power are distinct. Missing measured evidence is not zero.
GPU chart projections omit missing metric readings; measured zero remains zero.
The selected file/host series' full-record statistics include startup and warmup
and cover all chips regardless of visibility or chart downsampling. Current-version stored digests
are authoritative, including empty or absent metric digests. Outdated or
unversioned digests are recomputed read-only from retained DB samples. Keep these sample-weighted statistics separate from
serving-window power, J/token and selected-time-window calculations. The view reads
stored telemetry first, falls back to artifacts for missing storage, and preserves
upstream 503 failures. Treat an error as unavailable evidence, not an empty dataset.

Zoom, axis scale, theme, labels, report expansion, media playback and download
buttons are presentation state, not new datasets. AI-chart provider keys and
private prompts, feedback, local uploads and administrative mutations are not
public read projections. AgentX drilldowns use existing availability, aggregates,
histograms, request timelines, logs and server metrics operations.

Run-specific recognition labels do not rename API framework keys. Run
`35879254139` displays `UMBP MoRI SGLang` through October 9, 2026 in
America/New_York (`2026-10-10T04:00:00Z` exclusive); subsequent label resolution
returns `MoRI SGLang`. An already-open memoized chart may need a refresh.
Keep using `mori-sglang` for API selectors and raw CSV output throughout.
This display-only exception changes no API data or OpenAPI contract.

For every new or changed non-sensitive public-facing data view, implement or
update its read-only API in the same PR. Reuse the UI's pure transforms, test
selector effects and source semantics, and update OpenAPI, the route catalog,
coverage inventory and this existing npm package. Hidden navigation and feature
flags do not make public data sensitive.
