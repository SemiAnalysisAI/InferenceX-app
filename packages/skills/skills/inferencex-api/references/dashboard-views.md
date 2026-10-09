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

| View                            | Selection and calculation                                                                                                                                                                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options`                       | Static registries and defaults, JSON only. Data-dependent run/config choices come from their own views.                                                                                                                                                   |
| `inference`                     | Model, sequence, precisions, date/exact run, GPU/vendor/framework/deployment/spec/power filters; metric, xmode, xmetric, percentile, optimal/best/allPoints; TCO, custom costs/powers, pricing, unofficial runs, comparison dates/endpoints. JSON or CSV. |
| `historical`                    | Model, sequence, target, metric, precisions, GPUs/vendors/frameworks/deployment, start/end, TCO and pricing. `extendToDate` labels synthetic extension, defaults to current UTC date. JSON or CSV.                                                        |
| `calculator`                    | Model/sequence/run/date, precisions/GPUs, percentile, target/mode, token type, owning/renting cost, TCO, power budget, cost cap, hide-above-limit and public unofficial runs. JSON or CSV.                                                                |
| `first-token`                   | Benchmark selection plus 1–8 positive TTFT caps in seconds, minimum interactivity, cost provider and token type. Shared dashboard winner selection.                                                                                                       |
| `cache-reuse`                   | AgentX selection plus `config` from configurations and `recipe` from data.recipes. See recipe selection below.                                                                                                                                            |
| `profit-estimator`              | AgentX selection, comparison dates/runs, target, utilization, lab revenue share, list/OpenRouter/custom token prices, own/rent/custom chip costs, TCO and provisioned/modeled/compare power. USD/chip-hour.                                               |
| `profit-estimator-per-gigawatt` | Same selectors; USD/GW-year basis and owning-cost default.                                                                                                                                                                                                |
| `fleet`                         | Model/sequence/precision/GPUs, target/percentile, TCO/token type/cost provider, MW, input/output prices, ramp, cache discount, MTBI, recovery, horizon and metric. JSON or CSV.                                                                           |
| `evaluation`                    | Model, task, date, precision and GPU selection; public unofficial runs remain separately labeled and independent of the official date cutoff. JSON or CSV.                                                                                                |
| `reliability`                   | Rolling range, GPU selection and optional `asOf` date for reproducibility. JSON or CSV.                                                                                                                                                                   |
| `gpu-specs`                     | Full hardware properties or selected metric ranking; table/radar/bar are renderings of these values. JSON or CSV.                                                                                                                                         |
| `overview`                      | Models, model/hardware row limits, hardware tier, engine, comparison mode and reference. JSON or CSV.                                                                                                                                                     |
| `rankings`                      | Ranking kind (model or chip), selected model/scenario and format. Use the exact values in OpenAPI.                                                                                                                                                        |
| `compare`                       | GPU pairs, model/slug, scenario, tier selection and variant. JSON or CSV.                                                                                                                                                                                 |
| `collectivex`                   | Ordered run selection and suite; EP size/phase/modes/precision/operation/percentile/axis/SKU/backend/series; KV page size/x/y/pull/push/overlap ISL/series; swap direction/layout/metric/percentile/series.                                               |
| `submissions`                   | Search, table sort/direction/offset/limit, weekly/cumulative chart, on-change cutoff and NVIDIA/AMD/total lines. Table search does not filter the independent submission-volume chart.                                                                    |
| `current-inferencex-image`      | Model, sequence, hardware, precision, speculation, node type, framework families and `asOf` for image age/release status.                                                                                                                                 |
| `gpu-metrics`                   | Required run, file/host artifact, GPU indices, metric or correlation axes, statistics sorting, chart mode and interactive downsampling preference. One telemetry source per run; full-record statistics computed on read. Responses are no-store.         |
| `video`                         | CI run/artifact discovery; only already-published artifact reads; source, serving cell, media/fidelity slot, power phase and GPU denominator; same-workload comparisons, axes, deployment costs and selected tradeoff point. No-store.                    |

## Interpretation and maintenance

OperatorX is feature-gated in navigation and has no published
`/api/v1/views/operatorx` contract. Its `/api/v1/operatorx/*` routes belong to
the page and are not part of this skill's read-only view API.

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
