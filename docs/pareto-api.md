# Pareto boundary API

`GET /api/v1/pareto` returns the global Pareto frontier and opposite (hinterland)
boundary over a scoped set of stored benchmark observations. It uses the same
dominance function as the chart, with explicit axis preferences, and leaves
`/api/v1/benchmarks` unchanged.

The generated [English reference](https://inferencex.semianalysis.com/api),
[Chinese reference](https://inferencex.semianalysis.com/zh/api), and
[OpenAPI contract](https://inferencex.semianalysis.com/api/openapi.json) define the
request and response. These URLs expose the new endpoint after deployment.
The [bundled Pareto recipe](../packages/skills/skills/inferencex-api/references/pareto.md)
contains a complete request, snapshot rules, interpretation and chart-link modes.
No new formal CLI command or npm release is introduced by this change.

## Computation and provenance

The handler reuses the raw benchmark handler's cached query, fixture mode,
snapshot selection and power-validation filtering. It then selects one raw model
and workload, optionally narrows hardware/framework/precision by exact raw keys,
and computes both boundaries. The default benchmark response remains raw rows;
this beta derived endpoint is an explicit exception to that rule.

`xMetric` and `yMetric` name raw `metrics` keys. Directions are required (`min` or
`max`); the server does not infer metric intent. The hinterland reverses both
preferences. Boundary coordinates are sorted by ascending x and preserve every
tied observation, including its configuration and original provenance. Neither
boundary interpolates or extrapolates measurements. A singleton may belong to
both boundaries.

The response's `source_url` identifies the relative raw request, including date,
run and power selectors. `selection` records the remaining scope. Counts separate
raw returned rows, selected rows, eligible observations and missing/non-finite
axes. Zero and negative finite values remain valid. Empty results use HTTP 200;
invalid requests use 400; source failures remain errors. Successful responses use
the shared public benchmark cache policy.

## Dashboard relationship

The API pools all eligible stored observations in the requested scope. The chart
can instead pool currently visible official and unofficial observations after UI
filters and Optimal Only. This endpoint does not load unofficial artifacts or
apply browser-only filters, display conversions, cost formulas, or log-axis
positivity exclusions. Do not label its output as a reproduction of a screenshot
unless the caller has established equivalent inputs and axes.

For visual behavior, clipping, export and `i_frontier` / `i_hinterland` share-link
modes, see [Global Pareto highlights](./d3-charts.md#global-pareto-highlights).
These toggles control browser presentation and are rejected by the data endpoint.

## Maintenance

`src/lib/pareto-frontier.ts` owns the shared algorithm;
`src/lib/pareto-api.ts` owns request validation and response computation.
The route, shared contracts and generated documentation are tracked by the API
catalog guard. Update the bilingual registry, skill recipe and tests when
changing the contract.
