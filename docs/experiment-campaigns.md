# Experiment campaigns

The experiment branch reuses the inference dashboard with an explicit `experiment=weka-amg-kimi-k3` selector. Data lives in separate `experiment_campaigns`, `experiment_runs` and payload tables in the child database. It does not create official benchmarks or synthetic GitHub Actions IDs.

Read-only endpoints:

- `/api/v1/experiments/{campaign}` returns raw `{campaign,runs}`, including all replicates and genuine published reference points.
- `/api/v1/experiments/{campaign}/runs/{runId}` returns one raw run with stored aggregate/trace projections and payload inventory.

Both return no-store responses. Incomplete ingestion and missing identities return404; internal read failures return500. The UI adapts stored metrics through the existing chart transformation functions. String experiment identities must not be sent to numeric benchmark detail endpoints. The detail API is the raw-data drilldown when an existing numeric-ID detail component cannot be reused without changing identity semantics.

The API registry generates English/Chinese reference and OpenAPI entries. The existing inferencex-skills package documents selectors, control coverage, source attribution and cache/normalization limitations in `references/experiments.md`. The experiment branch keeps published data and bespoke data distinct; C150's recovery flag and .89 allocation setting remain visible.

## Experiment deployment

Created November 2, 2026, on Git branch `experiment/weka-amg-kimi-k3`. The isolated Neon child branch `weka-amg-kimi-k3` (`br-odd-math-aif8e7ha`) belongs to project `silent-pond-29172997` and branches from `main` (`br-restless-voice-ai2vkru2`). Branch expiry is explicitly unset. The 300-second compute autosuspend setting stops idle compute; it does not delete the database or its stored artifacts.

Vercel environment overrides are preview-only and scoped to this Git branch:

- `DATABASE_READONLY_URL`: child database reader role.
- `DATABASE_WRITE_URL` and `DATABASE_URL`: child database owner role, for authorized ingestion and administration.
- `CACHE_NAMESPACE` and `BLOB_CACHE_PREFIX`: `weka-amg-kimi-k3-20261109`.

Credentials are deployment secrets and are not recorded here. These overrides must not replace production or other preview environments. The child retains inherited published data while the separate experiment tables store this campaign; its API does not read local artifact paths at runtime.

The chart adapter uses a common comparison date to keep experimental repetitions together; tooltips retain each source measurement's actual date. The raw API preserves `configuration.date`, while published reference points retain their original source date. This display grouping does not change the measurements or their provenance.

## Database refresh — November 9, 2026

The existing child branch was reset to production `main` at 2026-11-09 15:48:52 UTC. Its database endpoint and no-expiry policy are retained. The experiment tables were recreated empty, and the preview reader role was restored with read-only access. The earlier 16 imported runs and payloads are no longer present; no three-hour results have been imported. The November 2 manifest and import receipt remain historical artifacts, not the current database inventory. An absent campaign returns 404 until a new import completes.

## Inference controls and API coverage

Select `experiment=weka-amg-kimi-k3` on the existing Kimi-K3 Agentic Traces view. This selection permits the experiment's framework comparison and the existing token-basis control without changing the global feature gate. `i_tokens=uncached` selects normalized throughput; `i_tokens=total` (the default) selects total tokens. Other models/scenarios retain their usual gates. The raw campaign API has no `i_tokens` parameter: it exposes input/output throughput and theoretical cache reuse so the existing shared chart transformation computes either basis. Measured cache-hit ratios remain separate evidence fields.

The adapter preserves the archived P90 full-response interactivity by mapping its reciprocal to the chart's P90 ITL inputs; it does not substitute that value for other genuine percentiles. Published reference rows replace the corresponding current B300/vLLM Agentic Traces rows to avoid duplicate official points. All ten WEKA repetitions retain distinct experiment identities. While the selected campaign loads, chart rows remain empty rather than briefly populating an official-only legend. Legend visibility, tooltip placement and loading presentation do not alter the raw API payload.

Inference share and axis links preserve the recognized experiment selector in both English and Chinese views. Experiment evidence actions use string-ID API detail links, including from legend tables; they do not fabricate GitHub Actions links or display the public-workflow reproducibility prompt for this campaign.
