# Branch-scoped experiments

The experiment deployment can expose independently ingested campaigns without inventing GitHub Actions run IDs or writing into official benchmark tables. Use the deployment's own origin; a side-branch campaign is not implicitly available on the production API.

```sh
curl -fsS "$EXPERIMENT_ORIGIN/api/v1/experiments/weka-amg-kimi-k3"
curl -fsS "$EXPERIMENT_ORIGIN/api/v1/experiments/weka-amg-kimi-k3/runs/sa-k3-original-rdma2048-c150-m089"
```

The campaign response is `{campaign, runs}`. `campaign.reference_points` contains the published comparison points and genuine source pointers. Each run has a string `run_id`, `series`, concurrency, replicate, raw `metrics`, `plot_metrics`, configuration, provenance, health, cache evidence, `clean_backend_qualified`, `frontier_eligible` and a record hash. Preserve every replicate and the exact source identity. Do not use these string IDs with numeric benchmark APIs or construct GitHub links from them.

The detail response is a single run with stored `aggregate_stats`, `chart_series`, `request_timeline` and `payload_inventory`. Missing measurements remain missing. The inventory describes retained raw payloads; this endpoint does not download compressed raw chunks. Both routes are unauthenticated read-only, `Cache-Control: no-store`, with404 for absent runs/campaigns or incomplete campaign ingestion and500 for database read errors. There are no query filters. Calculations and chart controls reuse the dashboard transformation layer; the raw endpoints do not recompute metrics.

For the Kimi-K3 experiment, retain ten WEKA replicates and six Mooncake native runs. The C150 .89 run completed but has one recovered missing-object read; it must remain visibly qualified and excluded from the clean frontier. Theoretical prefix reuse used for throughput normalization is different from measured GPU/external hit ratios. Backend RDMA bytes do not prove physical NVMe reads. Deployment selection, experimental scope and source hashes belong with exports.

## View/control coverage

- `experiment` selects a campaign in the existing inference view: raw coverage is the campaign endpoint.
- Model/scenario, metric, percentile, hardware/precision and display filters continue using the dashboard's existing transformations. The new route does not introduce separate formulas or defaults.
- Replicate identity, series/policy labels, recovery flags and published references are stored fields in the campaign response.
- Point detail and trace inspection are covered by the string-ID run detail endpoint.
- Chart zoom, tooltip placement and legend presentation do not change API data.
- No sensitive environment values, local credentials or mutation APIs are exposed.

Experimental curves use a common comparison date for grouping; actual measurement dates remain in `configuration.date` and tooltip provenance. Do not report the grouping date as the execution date.

## Token basis and comparison scope

On the Kimi-K3 Agentic Traces view, `experiment=weka-amg-kimi-k3` enables the experimental framework comparison and existing token-basis control. Use `i_tokens=uncached` for the theoretical-reuse-normalized basis or `i_tokens=total` for the default total-token basis. This exception is limited to the selected experiment/model/scenario; it does not unlock unrelated feature gates. The raw API always returns the stored inputs, so do not send `i_tokens` to the campaign endpoint or reinterpret measured cache hit rates as the theoretical normalization.

Archived P90 interactivity maps through reciprocal P90 ITL for numerical parity; other measured percentile values are retained. The experiment replaces matching current official B300/vLLM Agentic Traces rows with its 11 archived published references, rather than displaying both. All 16 experiment rows remain separate, including repeats and the flagged C150 point.

English and Chinese inference share links preserve the recognized experiment selector. Legend-table and tooltip evidence actions lead to the experiment run API, not a fabricated GitHub Actions page. The campaign does not use the public-workflow reproducibility prompt.
