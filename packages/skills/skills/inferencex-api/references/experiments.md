# Branch-scoped experiments

The experiment deployment can expose independently ingested campaigns without inventing GitHub Actions run IDs or writing into official benchmark tables. Use the deployment's own origin; a side-branch campaign is not implicitly available on the production API.

The isolated WEKA preview's `/infx/inference/kimi-k3` page and `/zh` sibling default to the latest three-hour campaign, normalized throughput, both series and all points when no explicit `experiment` selector is present. This preview-only redirect does not change the production page. Explicit campaign links retain their selection; client data refetches on mount and focus.

```sh
curl -fsS "$EXPERIMENT_ORIGIN/api/v1/experiments/weka-amg-kimi-k3-latest-3h"
curl -fsS "$EXPERIMENT_ORIGIN/api/v1/experiments/weka-amg-kimi-k3-latest-3h/runs/cam-k3-kdadr-20261104-c128"
curl --compressed -fsS "$EXPERIMENT_ORIGIN/api/v1/experiments/weka-amg-kimi-k3-latest-3h/runs/cam-k3-kdadr-20261104-c128/metrics"
```

The campaign response is `{campaign, runs}`. `campaign.reference_points` contains only explicitly selected published references; it is empty for the latest three-hour campaign. Each run has a string `run_id`, `series`, concurrency, replicate, raw `metrics`, `plot_metrics`, configuration, provenance, health, cache evidence, `clean_backend_qualified`, `frontier_eligible` and a record hash. Preserve every replicate and the exact source identity. Do not use these string IDs with numeric benchmark APIs or construct GitHub links from them.

The detail response is a single run with stored `aggregate_stats`, `chart_series`, `request_timeline` and `payload_inventory`. Missing measurements remain missing. The inventory describes retained raw payloads; this endpoint does not download compressed raw chunks. The metrics endpoint returns `{run, aggregateStats, requestChartData, requestTimeline, serverMetrics, metricSourceSeries}` for the standard per-point charts and request timeline. Its response supports gzip via `Accept-Encoding`; use `curl --compressed`. These routes are unauthenticated read-only, `Cache-Control: no-store`, with 404 for absent runs/campaigns or incomplete campaign ingestion and 500 for database read errors. There are no query filters. Calculations and chart controls reuse the dashboard transformation layer; the raw endpoints do not recompute metrics.

The latest campaign `weka-amg-kimi-k3-latest-3h` contains 13 latest WEKA runs and nine internal B300 Mooncake runs, all with a three-hour measurement and 20-minute trace-idle cap. Never mix this workload with the original one-hour/five-minute-cap scenario. WEKA uses 1,200 GiB FP8 KDA-state DRAM plus 8 TiB WEKA attention-KV storage; the internal baseline uses 2,248 GiB DRAM over EFA. The baseline line pools four serving variants; preserve `configuration.configuration_variant`, image, SDK and graph settings rather than claiming one fixed configuration.

All 22 runs remain available. The 19 clean runs are frontier-eligible; WEKA C128 (`health.qualification_code=metric-integrity`) and C140/C180 (`dram-recovery`) remain visible as disconnected triangles but cannot enter the clean frontier. Request performance and cache-counter integrity are distinct. The theoretical reuse fraction used for throughput normalization is not a measured cache-hit ratio, and connector bytes are not physical NVMe reads.

The historical `weka-amg-kimi-k3` selector remains supported for its original ten WEKA repetitions, six same-hardware Mooncake runs and eleven published references; its C150 recovery flag remains unchanged. A missing or reset campaign returns404, never a substituted published-only comparison.

## View/control coverage

- `experiment` selects a campaign in the existing inference view: raw coverage is the campaign endpoint.
- Model/scenario, metric, percentile, hardware/precision and display filters continue using the dashboard's existing transformations. The preview entry link supplies display defaults without introducing separate formulas.
- Replicate identity, series/policy labels, recovery flags and published references are stored fields in the campaign response.
- Point detail and trace inspection use `/infx/inference/experiments/{campaign}/{runId}` (and its `/zh` sibling), backed by the string-ID metrics endpoint. The viewer reuses the normal metric charts and request timeline; the raw run endpoint remains available for programmatic inspection.
- Chart zoom, tooltip placement and legend presentation do not change API data.
- No sensitive environment values, local credentials or mutation APIs are exposed.

Experimental curves use a common comparison date for grouping; actual measurement dates remain in `configuration.date` and tooltip provenance. Do not report the grouping date as the execution date.

## Token basis and comparison scope

On the Kimi-K3 Agentic Traces view, `experiment=weka-amg-kimi-k3-latest-3h` (or the historical `weka-amg-kimi-k3`) enables the experimental framework comparison and existing token-basis control. Use `i_tokens=uncached` for the theoretical-reuse-normalized basis or `i_tokens=total` for the default total-token basis. This exception is limited to the selected experiment/model/scenario; it does not unlock unrelated feature gates. The raw API always returns the stored inputs, so do not send `i_tokens` to the campaign endpoint or reinterpret measured cache hit rates as the theoretical normalization.

Archived P90 interactivity maps through reciprocal P90 ITL for numerical parity; other measured percentile values are retained. The latest three-hour selector excludes every official benchmark row and displays only its 22 measurements in two series. Set `i_optimal=0&i_best=0` to show all measured points; clean frontiers connect only eligible points. The historical one-hour selector replaces matching B300/vLLM rows with its eleven archived references and retains sixteen experiment rows. The actual shared chart transformations calculate the selected token basis and percentiles; no measurements are synthesized.

English and Chinese inference share links preserve the recognized experiment selector. Legend-table and tooltip point actions open the experiment per-point metrics viewer. Its campaign-scoped string identity does not imply a GitHub Actions run. The campaign does not use the public-workflow reproducibility prompt.

The latest three-hour campaign hides official workflow/date and history-comparison controls. The chart footer shows the actual measurement date range and links to the raw campaign API; published views and the historical campaign retain their normal controls.

Run responses may include nullable `config_name` and `perf_changelog` fields. These are editable display metadata, separate from measurements and hashed source records. The initial performance changelog explicitly says it is pending; do not interpret that placeholder as evidence of a performance change. Configuration names can summarize the serving setup and concurrency, while `configuration` retains the exact provenance. Source manifests, record hashes and payloads are unchanged by these labels.

## Preview workload selection

On this preview, the workload selector offers `experiment=published` for the published B300 baseline (one-hour measurement/five-minute trace-idle cap) and `experiment=weka-amg-kimi-k3-latest-3h` for AgentX 1.0.12 with three hours/20-minute trace-idle cap. Keep these scenarios in separate views and curves. The control is preview-only; production behavior is unchanged.

Published mode uses existing benchmark APIs and initially selects B300/vLLM. It is not an experiment campaign called `published`, and does not restore the earlier bespoke one-hour import. Experimental mode uses the campaign API and its two series. Switching reloads the view with the appropriate series, resets stale filters, and retains axes/token basis; share URLs preserve the explicit selection. The raw API shapes are unchanged.

Do not infer a universal published harness version: that field is absent from the benchmark API. Experimental run `configuration` supplies the exact harness, duration, trace-idle cap and system-idle cap. The 20-minute trace cap is distinct from actual wall-clock idle time.

Per-point pages reuse the standard point navigator, including concurrency chips, sorting and previous/next controls. Navigation stays within the selected campaign and backend (13 WEKA or nine internal Mooncake points in the latest campaign); the campaign API supplies these identities and metrics.

The WEKA preview adds an inter-turn gap distribution to experiment point pages. The metrics API exposes `interTurnGaps` with seconds-valued `profiling` and `warmup` arrays and definition `next_send_start_minus_previous_response_end`; other deployments return null. Derive from stored timeline v6 without database writes: pair consecutive turn indices within the same replay (`ri`) and exact session (`cid`, preserving child/aux suffixes). Exclude cancelled, invalid, overlapping and cross-phase pairs; never bridge missing turns or apply the configured idle cap. The stage selector chooses the same API samples used by the histogram. The log histogram and displayed percentiles exclude zero gaps with an explicit count; the API retains zeroes. These are observed elapsed gaps, not configured trace delays or request latency.
