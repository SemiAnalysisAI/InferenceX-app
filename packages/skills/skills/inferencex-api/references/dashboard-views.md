# Dashboard read-only views

Use `/api/v1/views/*` for dashboard-calculated values. Read the deployed
[OpenAPI contract](https://inferencex.semianalysis.com/api/openapi.json) first:
these routes become available only after the corresponding app change deploys.
Do not assume an installed skill proves server availability.

## Historical editorial articles

The GLM-5.3 article at
`/blog/sparse-savings-persistent-demand-inside-glm53` (Chinese:
`/zh/blog/sparse-savings-persistent-demand-inside-glm53`) preserves the newsletter's
September 28, 2026 snapshot, original figures, and framework/TTFT qualifications.
Discover public article text through `/llms.txt` and `/llms-full.txt`; the
subscriber-only continuation is linked, not exposed by those feeds.
This is static editorial content, not a new view API. For fresh measurements use
the existing `inference`, `first-token`, and `cache-reuse` contracts below, with
explicit selectors. Do not replace the article's historical costs with current
results or treat its interpolated values as separately measured operating points.

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
The inference dashboard resets manual legend selections and Best per SKU overrides
when the reader chooses a different model in the model selector; same-model axis
changes preserve manual selections. Initial
share links and explicit presets still apply their selections. View API requests
are stateless: omit `best` for the default ranking, or send `best=false` explicitly
for each model to retain all selected series. Do not infer a destination model's
default from a manual engine selection made on another model.

Example URLs (check deployed availability before use):

```text
https://inferencex.semianalysis.com/api/v1/views/options
https://inferencex.semianalysis.com/api/v1/views/inference?model=DeepSeek-V4-Pro&sequence=agentic-traces&optimal=false&best=false
https://inferencex.semianalysis.com/api/v1/views/first-token?model=DeepSeek-V4-Pro&caps=2,5,10&minInteractivity=150
https://inferencex.semianalysis.com/api/v1/views/profit-estimator?model=DeepSeek-V4-Pro&priceSource=custom&inputPrice=1&cachedInputPrice=0.1&outputPrice=1
```

## Profit estimator defaults

Both views default `cacheHitMode` to `theoretical`, displayed as
“Theroticial Roofline” in English and Chinese dashboards. This uses the
trace-derived infinite-cache hit rate, falling back to the measured rate when
unavailable. Pass `cacheHitMode=actual` for measured cache behavior; dashboard
links preserve that choice as `/cache-hit-mode/actual`. Report the resolved
`params.cacheHitMode` alongside the pricing assumptions.

Both profit views default DeepSeek V4 Pro to `target=35` tok/s/user when
`target` is omitted, matching the English and Chinese dashboards. Explicit
targets still override the default; list pricing and the 0% model license fee
are unchanged. The 2026-10-13 choice uses the early-October
[OpenRouter snapshot](https://openrouter.ai/deepseek/deepseek-v4-pro-0813#providers)
as context (40.8 tok/s mean and 39.5 median across 22 endpoint P50 values).
Treat 35 as an editable operating assumption, not a traffic-weighted mean or
an OpenRouter P90-equivalent measurement.

## Staged-run Pareto links

A `/stage-results` response contains one chart link per ingested model, workload,
precision and hardware/framework line. Follow its complete query string: the
run date alone does not identify that line. Dashboard links combine
`i_dates=YYYY-MM-DD~rRUN_ID` with `i_gpus`, `g_model`, `i_seq` and `i_prec`.
`RUN_ID` is the GitHub Actions run ID, not an internal `workflow_run_id`.
Agentic lines may combine speculative methods and parallelism settings; do not
split those points into separate lines merely because their recipes differ.

For the corresponding read-only `inference` view, retain the link's deployment
origin and translate its selectors as follows:

| Chart parameter         | Inference view parameter |
| ----------------------- | ------------------------ |
| `g_model`               | `model`                  |
| `i_seq`                 | `sequence`               |
| `i_prec`                | `precisions`             |
| `i_gpus`                | `gpus`                   |
| `i_dates`               | `dates`                  |
| `i_metric=y_tpPerGpu`   | `metric=tpPerGpu`        |
| `i_xmode=interactivity` | `xmode=interactivity`    |

Use `optimal=true&best=false` to retain the selected line's Pareto points.
Read the `comparisons` item whose `entry` equals the requested
`YYYY-MM-DD~rRUN_ID`; the response's top-level `series` has its own primary selection.
Alternatively, use `runId=RUN_ID` with the same model/workload/precision/hardware
selectors to request that exact snapshot in the top-level `series`.

A run-qualified comparison stays present even when `runId` selects that same
run as the primary series. Each comparison is independently evaluated; it is not
replaced with a date-wide merged curve. An append-only run's snapshot can include
carried-forward points, whose producer identity must remain intact. Do not move
a staging link to production and assume that its unpublished run is available
there. `i_linelabel=1` controls rendered labels only and has no API equivalent.

## View selection

All paths below are relative to `/api/v1/views/`. The maintained exhaustive
query-key list is in the app's OpenAPI contract. The following groups explain
which controls belong together.

| View                            | Selection and calculation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `options`                       | Static registries and defaults, JSON only. Data-dependent run/config choices come from their own views.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `inference`                     | Model, sequence, precisions, date/exact run, GPU/vendor/framework/deployment/spec/power filters; metric, xmode, xmetric, percentile, optimal/best/allPoints; TCO, custom costs/powers, pricing, unofficial runs, comparison dates/endpoints. JSON or CSV.                                                                                                                                                                                                                                                                                        |
| `historical`                    | Model, sequence, target, metric, precisions, GPUs/vendors/frameworks/deployment, start/end, TCO and pricing. `extendToDate` labels synthetic extension, defaults to current UTC date. JSON or CSV.                                                                                                                                                                                                                                                                                                                                               |
| `calculator`                    | Model/sequence/run/date, precisions/GPUs, percentile, target/mode, token type, owning/renting cost, TCO, power budget, cost cap, hide-above-limit and public unofficial runs. JSON or CSV.                                                                                                                                                                                                                                                                                                                                                       |
| `first-token`                   | Benchmark selection plus 1–8 positive TTFT caps in seconds, minimum interactivity, cost provider and token type. Shared dashboard winner selection.                                                                                                                                                                                                                                                                                                                                                                                              |
| `cache-reuse`                   | AgentX selection plus `config` from configurations and `recipe` from data.recipes. See recipe selection below.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `profit-estimator`              | AgentX selection, comparison dates/runs, target, utilization, lab revenue share, list/OpenRouter/custom token prices, own/rent/custom chip costs, TCO and provisioned/modeled/compare power. USD/chip-hour.                                                                                                                                                                                                                                                                                                                                      |
| `profit-estimator-per-gigawatt` | Same selectors; USD/GW-year basis and owning-cost default.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `fleet`                         | Model/sequence/precision/GPUs, target/percentile, TCO/token type/cost provider, MW, input/output prices, ramp, cache discount, MTBI, recovery, horizon and metric. JSON or CSV.                                                                                                                                                                                                                                                                                                                                                                  |
| `evaluation`                    | Model, task, date, precision and GPU selection; public unofficial runs remain separately labeled and independent of the official date cutoff. JSON or CSV.                                                                                                                                                                                                                                                                                                                                                                                       |
| `reliability`                   | Rolling range, GPU selection and optional `asOf` date for reproducibility. JSON or CSV.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `gpu-specs`                     | Full hardware properties or selected metric ranking; table/radar/bar are renderings of these values. JSON or CSV.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `overview`                      | Models, model/hardware row limits, hardware tier, engine, comparison mode and reference. JSON or CSV.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `rankings`                      | Ranking kind (model or chip), selected model/scenario and format. Use the exact values in OpenAPI.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `compare`                       | GPU pairs, model/slug, scenario, tier selection and variant. JSON or CSV.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `collectivex`                   | Ordered run selection and suite; EP size/phase/modes/precision/operation/percentile/axis/SKU/backend/series; KV page size/x/y/pull/push/overlap ISL/series; swap direction/layout/metric/percentile/series.                                                                                                                                                                                                                                                                                                                                      |
| `submissions`                   | Search, table sort/direction/offset/limit, weekly/cumulative chart, on-change cutoff and NVIDIA/AMD/total lines. Table search does not filter the independent submission-volume chart.                                                                                                                                                                                                                                                                                                                                                           |
| `current-inferencex-image`      | Model, sequence, hardware, precision, speculation, node type, framework families and `asOf` for image age/release status.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `gpu-metrics`                   | Required run, file/host artifact, GPU indices, metric or correlation axes, statistics sorting, chart mode and interactive downsampling preference. One telemetry source per run; full-record statistics computed on read. Responses are no-store.                                                                                                                                                                                                                                                                                                |
| `ubenchx`                       | Test selector (`test`: `mem-bw`, `sm-l2-distance`, `tpc-skyline`, or `all`) plus GPU selector (`all` or one GPU). `mem-bw` returns static device-memory copy bandwidth rows with derived MBU and latency. `sm-l2-distance` returns SM-to-SM L2 latency difference matrix with GPC/die topology and summary statistics. `tpc-skyline` returns measured TPCs per GPC (sorted descending) with GPC, TPC, and SM counts, defaulting to every GPU. `all` (default) returns every test. The Y-axis selector on `/ubenchx/mem-bw` is presentation-only. |
| `video`                         | CI run/artifact discovery; only already-published artifact reads; source, serving cell, media/fidelity slot, power phase and GPU denominator; same-workload comparisons, axes, deployment costs and selected tradeoff point. No-store.                                                                                                                                                                                                                                                                                                           |

## Interpretation and maintenance

### GPU telemetry coverage

`/api/v1/views/gpu-metrics` requires a positive safe-integer `runId`. Choose
`artifact` from `artifacts[]`: a plain artifact name, or `<artifact>/<file>` when
one artifact contains several files. `downsample` only sets the renderer hint
`maxInteractivePoints` to 2000 (default) or `null`; rows and statistics stay unsampled.

Stored telemetry includes run-wide `coverage`, even when one host is selected:
`complete` means the recorded artifact/file inventory is present, `partial` means
recorded telemetry is missing, and `unknown` means a complete inventory was not
retained. `missingArtifacts` lists entirely missing artifacts and may be empty
when only a file is incomplete. GitHub coverage is `null`
(unassessed). Available stored telemetry remains readable when partial; do not
interpret it as a complete run or combine it with live GitHub samples.

### Image submission age

`/api/v1/views/current-inferencex-image?includeHistory=true` adds `ageHistory`:
90 daily UTC points ending on `asOf` (today by default), each containing `date`,
`p90AgeDays` and `configurationCount`. `ageSummary` is always returned for the
current filtered image rows. All existing model, sequence, hardware, precision,
speculation, node-type and framework filters apply to both.
The default scenario is `agentic-traces` (Agentic) and the default `nodeType` is
`all`, including non-disaggregated and disaggregated configurations. A model
without Agentic observations falls back to its first available active scenario.

P90 uses nearest rank, one vote per displayed configuration, measured in whole
days since its latest successful image-bearing submission. Reusing the same
image tag in a new submission resets age. This is not the container's build age.
History carries older observations into the window, includes configurations
only from their first submission, and excludes future observations. Empty days
have `p90AgeDays: null`, not zero. Today's model/scenario retirement rules apply
throughout the historical window; historical retirement states are not stored.
The current table uses the latest benchmark snapshot, whereas history uses
successful image-bearing submission events. The chart's hover and keyboard
inspection are presentation-only and introduce no extra selectors.

OperatorX is feature-gated in navigation and has no published
`/api/v1/views/operatorx` contract. Its `/api/v1/operatorx/*` routes belong to
the page and are not part of this skill's read-only view API.

The explorer's session-list version filter uses the same parser as its other
pages: absent, `all`, invalid, or out-of-range versions mean no version filter.
The Agentic Workload Explorer is also feature-gated and has no published
`/api/v1/views/agentic-workload-explorer` contract. Its
`/api/v1/agentic-workload-explorer/*` routes serve a frozen, anonymized
ProxyTrace snapshot to the page and are not part of this skill's read-only view API.
Its shared select/toggle controls retain the same model, client, time-window, and
trace-version query semantics. Shared-D3 chart expansion, zoom/reset, tooltip,
and PNG export are presentation-only controls; they add no API routes or writable
snapshot access.

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
GPU chart projections omit missing metric readings; measured zero remains zero.
The selected file/host series' full-record statistics include startup and warmup
and cover all chips regardless of visibility or chart downsampling. Stats rows carry
no `metric` field; `params.metric` identifies the selected metric. For stored runs they
are computed from the stored samples on each read; a series whose stored samples are
incomplete returns no statistics. Keep these sample-weighted statistics separate from
serving-window power and J/token. The view reads each run from one source: its stored
series once the run is ingested, otherwise its artifacts. It preserves upstream 503
failures. Treat an error as unavailable evidence, not an empty dataset.

Zoom, axis scale, theme, labels, report expansion, media playback and download
buttons are presentation state, not new datasets. AI-chart provider keys and
private prompts, feedback, local uploads and administrative mutations are not
public read projections. AgentX drilldowns use existing availability, aggregates,
histograms, request timelines, logs and server metrics operations.

Run-specific recognition labels do not rename API framework keys. Runs
`35879254139` and `37181045340` display `UMBP MoRI SGLang` through October 9, 2026 in
America/New_York (`2026-10-10T04:00:00Z` exclusive); subsequent label resolution
returns `MoRI SGLang`. An already-open memoized chart may need a refresh.
Keep using `mori-sglang` for API selectors and raw CSV output throughout.
This display-only exception changes no API data or OpenAPI contract.

For every new or changed non-sensitive public-facing data view, implement or
update its read-only API in the same PR. Reuse the UI's pure transforms, test
selector effects and source semantics, and update OpenAPI, the route catalog,
coverage inventory and this existing npm package. Hidden navigation and feature
flags do not make public data sensitive.

### Cache-reuse recipe selection

Pass a returned `data.recipes[].key` as `recipe`; `params.recipe` identifies the resolved selection. Missing or stale keys use the dashboard default. Each run uses the selected recipe if available, otherwise its own best-covered recipe. Inspect each bar's source row for its recipe identity. Without official rows, choices come from matching overlay runs.
