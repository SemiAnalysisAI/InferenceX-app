# Branch-scoped experiments

The experiment deployment can expose independently ingested campaigns without inventing GitHub Actions run IDs or writing into official benchmark tables. Use the deployment's own origin; a side-branch campaign is not implicitly available on the production API.

```sh
curl -fsS "$EXPERIMENT_ORIGIN/api/v1/experiments/weka-amg-kimi-k3-latest-3h"
curl -fsS "$EXPERIMENT_ORIGIN/api/v1/experiments/weka-amg-kimi-k3-latest-3h/runs/cam-k3-kdadr-20261104-c128"
```

The campaign response is `{campaign, runs}`. `campaign.reference_points` contains only explicitly selected published references; it is empty for the latest three-hour campaign. Each run has a string `run_id`, `series`, concurrency, replicate, raw `metrics`, `plot_metrics`, configuration, provenance, health, cache evidence, `clean_backend_qualified`, `frontier_eligible` and a record hash. Preserve every replicate and the exact source identity. Do not use these string IDs with numeric benchmark APIs or construct GitHub links from them.

The detail response is a single run with stored `aggregate_stats`, `chart_series`, `request_timeline` and `payload_inventory`. Missing measurements remain missing. The inventory describes retained raw payloads; this endpoint does not download compressed raw chunks. Both routes are unauthenticated read-only, `Cache-Control: no-store`, with404 for absent runs/campaigns or incomplete campaign ingestion and500 for database read errors. There are no query filters. Calculations and chart controls reuse the dashboard transformation layer; the raw endpoints do not recompute metrics.

The latest campaign `weka-amg-kimi-k3-latest-3h` contains 13 latest WEKA runs and nine internal B300 Mooncake runs, all with a three-hour measurement and 20-minute trace-idle cap. Never mix this workload with the original one-hour/five-minute-cap scenario. WEKA uses 1,200 GiB FP8 KDA-state DRAM plus 8 TiB WEKA attention-KV storage; the internal baseline uses 2,248 GiB DRAM over EFA. The baseline line pools four serving variants; preserve `configuration.configuration_variant`, image, SDK and graph settings rather than claiming one fixed configuration.

All 22 runs remain available. The 19 clean runs are frontier-eligible; WEKA C128 (`health.qualification_code=metric-integrity`) and C140/C180 (`dram-recovery`) remain visible as disconnected triangles but cannot enter the clean frontier. Request performance and cache-counter integrity are distinct. The theoretical reuse fraction used for throughput normalization is not a measured cache-hit ratio, and connector bytes are not physical NVMe reads.

The historical `weka-amg-kimi-k3` selector remains supported for its original ten WEKA repetitions, six same-hardware Mooncake runs and eleven published references; its C150 recovery flag remains unchanged. A missing or reset campaign returns404, never a substituted published-only comparison.

## View/control coverage

- `experiment` selects a campaign in the existing inference view: raw coverage is the campaign endpoint.
- Model/scenario, metric, percentile, hardware/precision and display filters continue using the dashboard's existing transformations. The new route does not introduce separate formulas or defaults.
- Replicate identity, series/policy labels, recovery flags and published references are stored fields in the campaign response.
- Point detail and trace inspection are covered by the string-ID run detail endpoint.
- Chart zoom, tooltip placement and legend presentation do not change API data.
- No sensitive environment values, local credentials or mutation APIs are exposed.

Experimental curves use a common comparison date for grouping; actual measurement dates remain in `configuration.date` and tooltip provenance. Do not report the grouping date as the execution date.

## Token basis and comparison scope

On the Kimi-K3 Agentic Traces view, `experiment=weka-amg-kimi-k3-latest-3h` (or the historical `weka-amg-kimi-k3`) enables the experimental framework comparison and existing token-basis control. Use `i_tokens=uncached` for the theoretical-reuse-normalized basis or `i_tokens=total` for the default total-token basis. This exception is limited to the selected experiment/model/scenario; it does not unlock unrelated feature gates. The raw API always returns the stored inputs, so do not send `i_tokens` to the campaign endpoint or reinterpret measured cache hit rates as the theoretical normalization.

Archived P90 interactivity maps through reciprocal P90 ITL for numerical parity; other measured percentile values are retained. The latest three-hour selector excludes every official benchmark row and displays only its 22 measurements in two series. Set `i_optimal=0&i_best=0` to show all measured points; clean frontiers connect only eligible points. The historical one-hour selector replaces matching B300/vLLM rows with its eleven archived references and retains sixteen experiment rows. The actual shared chart transformations calculate the selected token basis and percentiles; no measurements are synthesized.

English and Chinese inference share links preserve the recognized experiment selector. Legend-table and tooltip evidence actions lead to the experiment run API, not a fabricated GitHub Actions page. The campaign does not use the public-workflow reproducibility prompt.

The latest three-hour campaign hides official workflow/date and history-comparison controls. The chart footer shows the actual measurement date range and links to the raw campaign API; published views and the historical campaign retain their normal controls.
