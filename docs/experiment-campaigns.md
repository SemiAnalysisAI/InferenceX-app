# Experiment campaigns

The experiment branch reuses the inference dashboard with an explicit campaign selector: `experiment=weka-amg-kimi-k3-latest-3h` for the latest three-hour comparison, or `experiment=weka-amg-kimi-k3` for the historical one-hour campaign. Data lives in separate `experiment_campaigns`, `experiment_runs` and payload tables in the child database. It does not create official benchmarks or synthetic GitHub Actions IDs.

Read-only endpoints:

- `/api/v1/experiments/{campaign}` returns raw `{campaign,runs}`, including all runs, qualification flags and any explicitly stored reference points.
- `/api/v1/experiments/{campaign}/runs/{runId}` returns one raw run with stored aggregate/trace projections and payload inventory.

Both return no-store responses. Incomplete ingestion and missing identities return404; internal read failures return500. The UI adapts stored metrics through the existing chart transformation functions. String experiment identities must not be sent to numeric benchmark detail endpoints. The detail API is the raw-data drilldown when an existing numeric-ID detail component cannot be reused without changing identity semantics.

The API registry generates English/Chinese reference and OpenAPI entries. The existing inferencex-skills package documents selectors, control coverage, source attribution and cache/normalization limitations in `references/experiments.md`. The experiment branch keeps the three-hour campaign separate from published one-hour measurements. Each run retains its qualification and serving configuration.

## Experiment deployment

Created November 2, 2026, on Git branch `experiment/weka-amg-kimi-k3`. The isolated Neon child branch `weka-amg-kimi-k3` (`br-odd-math-aif8e7ha`) belongs to project `silent-pond-29172997` and branches from `main` (`br-restless-voice-ai2vkru2`). Branch expiry is explicitly unset. The 300-second compute autosuspend setting stops idle compute; it does not delete the database or its stored artifacts.

Vercel environment overrides are preview-only and scoped to this Git branch:

- `DATABASE_READONLY_URL`: child database reader role.
- `DATABASE_WRITE_URL` and `DATABASE_URL`: child database owner role, for authorized ingestion and administration.
- `CACHE_NAMESPACE` and `BLOB_CACHE_PREFIX`: `weka-amg-kimi-k3-20261109`.

Credentials are deployment secrets and are not recorded here. These overrides must not replace production or other preview environments. The child retains inherited published data while the separate experiment tables store this campaign; its API does not read local artifact paths at runtime.

On this isolated preview, `/infx/inference/kimi-k3` (and its `/zh` sibling) temporarily redirects to the latest three-hour campaign when no `experiment` selector is supplied. It defaults to normalized throughput with both series and all measurements visible. The redirect is enabled only by the preview's exact cache namespace. Explicit campaign links remain unchanged. The experiment client refetches on mount and window focus; its API remains no-store.

The chart adapter uses a common comparison date to keep experimental repetitions together; tooltips retain each source measurement's actual date. The raw API preserves `configuration.date`, while published reference points retain their original source date. This display grouping does not change the measurements or their provenance.

## Database refresh — November 9, 2026

The existing child branch was reset to production `main` at 2026-11-09 15:48:52 UTC. Its database endpoint and no-expiry policy are retained. The experiment tables were recreated empty, and the preview reader role was restored with read-only access. The earlier 16 imported runs and payloads were removed by this refresh. The subsequent three-hour import uses a new campaign slug; it does not restore the historical import. The November 2 manifest and import receipt remain historical artifacts, not the current database inventory. An absent campaign returns 404 until a new import completes.

## Latest three-hour comparison

Imported November 9, 2026 at 16:20 UTC: all 22 records and 66 compressed profile, server-metric and server-log payloads verified against the source artifacts. `packages/db/experiments/latest-import-receipt.json` records this import.

`weka-amg-kimi-k3-latest-3h` defines 22 measurements: 13 latest WEKA AMG runs (C32, 40, 48, 56, 70, 96, 128, 140, 150, 180, 200, 220, 250) and nine internal B300 Mooncake runs (C32, 40, 48, 56, 70, 96, 128, 140, 150). All use a 10,800-second measurement and 1,200-second trace-idle cap with speculation disabled. The trace-idle cap is not a guarantee of 20 minutes of wall-clock idleness.

The two series are **Latest WEKA AMG** (1,200 GiB FP8 KDA-state DRAM plus 8 TiB WEKA attention-KV storage) and **Internal Mooncake DRAM** (2,248 GiB DRAM over EFA). The internal line is the best measured envelope across four serving variants; the original variant, image, graph setting and SDK remain in run configuration metadata. C128 carries `health.qualification_code=metric-integrity`; C140/C180 carry `dram-recovery`. All three stay visible as triangles but are excluded from frontier candidates. The 19 clean points include dominated measurements.

This campaign has no published reference points. Selecting it excludes all official rows from the chart rather than overlaying a different one-hour scenario. Both series use November 9 only as a curve-grouping date; actual run dates remain unchanged. `i_optimal=0&i_best=0` shows all measurements, including dominated and flagged points. Frontier computation itself is unchanged.

## Inference controls and API coverage

Select either recognized `experiment` campaign on the existing Kimi-K3 Agentic Traces view. This selection permits the experiment's framework comparison and the existing token-basis control without changing the global feature gate. `i_tokens=uncached` selects normalized throughput; `i_tokens=total` (the default) selects total tokens. Other models/scenarios retain their usual gates. The raw campaign API has no `i_tokens` parameter: it exposes input/output throughput and theoretical cache reuse so the existing shared chart transformation computes either basis. Measured cache-hit ratios remain separate evidence fields.

The adapter preserves the archived P90 full-response interactivity by mapping its reciprocal to the chart's P90 ITL inputs; it does not substitute that value for other genuine percentiles. For the historical one-hour campaign only, published reference rows replace corresponding current B300/vLLM Agentic Traces rows to avoid duplicates. Every measured repetition retains its own experiment identity. The latest three-hour campaign includes no official rows. While the selected campaign loads or is unavailable, chart rows remain empty rather than briefly populating an official-only legend. Legend visibility, tooltip placement and loading presentation do not alter the raw API payload.

Inference share and axis links preserve the recognized experiment selector in both English and Chinese views. Experiment evidence actions use string-ID API detail links, including from legend tables; they do not fabricate GitHub Actions links or display the public-workflow reproducibility prompt for this campaign.

For the latest three-hour campaign, the dashboard hides official workflow/date and historical-comparison controls. Its footer shows the actual measurement date range and links “Experiment measurements” to the campaign API. Published and historical campaign views retain their existing controls.

Run responses also expose optional nullable `config_name` and `perf_changelog` display metadata. Configuration names identify the serving setup and concurrency. The initial changelog is explicitly a placeholder: “Manual import: 3-hour AgentX, 1,200s trace-idle cap. Performance changelog pending.” These editable labels are separate from the hashed source record; adding them does not change measurements, qualifications, source manifests, record hashes or retained payloads. A pending changelog does not imply a measured performance change.

## Preview workload selector

The branch-only workload selector separates **Published B300 baseline · 1 hour / 5-minute trace-idle cap** (`experiment=published`) from **AgentX 1.0.12 · 3 hours / 20-minute trace-idle cap** (`experiment=weka-amg-kimi-k3-latest-3h`). The selector is gated by `NEXT_PUBLIC_WEKA_PREVIEW`, derived from the isolated preview cache namespace. It does not appear on production.

Published mode reads existing benchmark APIs and initially selects B300/vLLM. Experimental mode reads the stored campaign and selects the latest WEKA and internal Mooncake series. Switching reloads the page, resets stale workload-specific filters and retains the selected chart axes and token basis. Share links retain the explicit mode. These workloads are not comparable on the same curve; selecting published data does not reimport or display the earlier bespoke one-hour runs.

The published B300 workload label follows the archived one-hour/five-minute comparison; its 11 stored points come from workflow `31893747354`. The published benchmark API does not expose a harness-version or trace-idle-cap field, so the selector does not assign one harness version to all published hardware. The three-hour campaign exposes `configuration.harness`, `benchmark_duration_seconds`, `trace_idle_gap_cap_seconds` and `system_idle_gap_cap_seconds` for every run. `experiment=published` is a UI mode, not a campaign slug accepted by the experiment API.
