# Pareto frontier and hinterland

Read this for boundary observations or chart highlight links. This is a raw HTTP
workflow, outside the six formal CLI bundle families.

## Query boundary observations

1. Read the deployed [OpenAPI contract](https://inferencex.semianalysis.com/api/openapi.json)
   and confirm `/api/v1/pareto` exists before querying it. If the deployment lacks
   this endpoint, report that limitation; do not substitute `/tco-feed` or claim
   the boundary query succeeded. An updated source skill does not imply an npm release.
2. Resolve the display model, exact raw model key, workload and optional exact
   hardware/framework/precision from `/api/v1/availability`. Require the user's
   two raw metric keys and preferred directions. Read metric units in
   `BenchmarkRows.items.properties.metrics`; do not send chart display labels.
3. Save the complete JSON response, request URL, retrieval time, HTTP status and
   the deployed contract outside any immutable formal bundle. For example:

```bash
curl --fail-with-body --get 'https://inferencex.semianalysis.com/api/v1/pareto' \
  --data-urlencode 'model=DeepSeek-R1-0528' \
  --data-urlencode 'rawModel=dsr1' \
  --data-urlencode 'sequence=1k/1k' \
  --data-urlencode 'xMetric=median_intvty' \
  --data-urlencode 'yMetric=output_tput_per_gpu' \
  --data-urlencode 'xDirection=max' \
  --data-urlencode 'yDirection=max' \
  --output pareto.json
```

4. Report the returned selection and counts before sampling boundary observations.
   Completion means both boundaries, their source evidence and exclusions have
   been accounted for, including a valid empty result.

`model`, `rawModel`, `sequence`, `xMetric`, `yMetric`, `xDirection` and `yDirection`
are required. `sequence` accepts `1k/1k`, `1k/8k`, `8k/1k` (single-turn) or
`agentic-traces`. `min` means lower is better; `max` means higher is better.
For latency versus throughput use `min/max`; for interactivity versus energy per
output token use `max/min` and `powerValid=strictV2`. Registered power/energy axes
require strictV2; other axes may also opt into it.

Optional `hardware`, `framework` and `precision` each accept one exact raw key,
not a CSV list. Omission pools all matching values. Unknown filter values produce
an empty selection, not a fallback. Unknown, repeated and empty query parameters
return 400.

Use `date=YYYY-MM-DD` for an as-of snapshot; `exact=true` requires that date.
`runId` constrains the latest lookup. `exactRun=true` requires a positive
safe-integer `runId` and reads its stored logical snapshot, including same-image
predecessors for append-only runs. Do not combine `exactRun=true` with `date` or
`exact`. Source observation dates can precede snapshot dates.

## Interpret the response

- `frontier`: non-dominated coordinates under the requested preferences.
- `hinterland`: the opposite boundary, computed by reversing both preferences.
  It connects worst-boundary points; it is not the whole dominated region.
- Each boundary is sorted by ascending `x`; `{x,y,observations}` preserves every
  tied observation at a boundary coordinate. Keep each observation's `id`, raw
  configuration, `date`, `run_url`, and any producer or `curve_*` metadata.
- `counts.returned` is the raw response count after any strictV2 filtering;
  `selected` follows exact scope filters; `eligible` has both finite numeric axes;
  `missing_or_nonfinite` is `selected - eligible`. Ties count as observations.
- Resolve relative `source_url` against the API origin to recover the raw snapshot
  request. Combine it with `selection` to reproduce the boundary scope.

Coordinates keep raw units. Missing/non-finite axes are excluded, never replaced
with zero. Finite zero and negative values are kept. An empty result is 200 with
empty arrays, not evidence that no benchmarks ran. API or network failures are
errors, not empty evidence.

Do not claim exact dashboard parity: this endpoint does not apply browser-only
Optimal Only, hidden-series/quick filters, log-axis positivity exclusions, display
conversions, cost formulas or unofficial artifact overlays. `runId` selects stored
data; it does not fetch an unofficial GitHub artifact. The server and chart share
the dominance algorithm, not the complete input-selection pipeline. No
interpolation, extrapolation, polygon or background image is returned.

## Chart links

The inference scatter chart's Advanced section has independent Pareto Frontier
and Pareto Hinterland toggles. First enable shows green/red shading; off then on
again shows faded castle/swamp scenery. Further off/on cycles alternate styles.
Collapsing Advanced keeps active highlights visible.

Use `i_frontier=1` / `i_hinterland=1` for plain shading, `2` for scenery, or omit
to disable. Preserve the existing model, workload, metrics, filters and snapshot
in the shared dashboard URL. These are browser parameters, not API parameters.
Both lines connect measured vertices; segments do not establish measurements
between them. Only two-objective inference scatter views support these controls.
