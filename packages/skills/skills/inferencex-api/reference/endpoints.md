# InferenceX API — Exhaustive Endpoint Reference

Base URL: `https://inferencex.semianalysis.com`. All endpoints are GET, no auth.

Views endpoints (`/api/v1/views/*`) are stability **beta**; raw-rows endpoints are **stable**.
Every views JSON response is wrapped in the envelope
`{ view, apiVersion: 'v1', generatedAt, params: {resolved effective values}, ...payload }`.
Invalid enum values return HTTP 400 `{ error, allowed: [...] }`.

Shared value domains (from `/api/v1/views/options`):

- **Models** (display names; case-insensitive; compare-slug aliases accepted):
  `DeepSeek-V4-Pro` (default), `Kimi-K3`, `MiniMax-M3`, `GLM-5.2`, `Qwen-3.5-397B-A17B`,
  `DeepSeek-R1-0528` (maintenance), plus deprecated `Kimi-K2.5`, `GLM-5`, `gpt-oss-120b`,
  `MiniMax-M2.5`, `Llama-3.3-70B`.
- **Sequences**: `1k/1k` (deprecated), `1k/8k` (deprecated), `8k/1k`, `agentic-traces`.
  Views params accept both `8k/1k` and `8k-1k` forms, plus `agentic` for `agentic-traces`.
- **Precisions**: `fp4`, `fp8`, `bf16`, `int4` (share-param form also allows `fp4fp8`).
- **GPU base keys**: `vr200`, `h100`, `h200`, `b200`, `b300`, `gb200`, `gb300`, `mi300x`,
  `mi325x`, `mi355x`, `rtx6000pro`, `jalapeno`.
- **Frameworks**: `atom`, `coreweave-vera-rubin`, `dynamo-sglang`, `dynamo-trt`, `dynamo-vllm`,
  `llmd-vllm`, `mooncake-atom`, `mori-sglang`, `rubin-july`, `sglang`, `tilert`, `teacup`,
  `trt`, `vllm`. Framework quick-filter families: `vllm`, `sglang`, `trt`, `atom`.
- **Hardware series key (hwKey)**: `<gpu>_<framework>[_<spec>]`, e.g. `b200_trt`,
  `mi355x_sglang`, `b200_sglang_mtp`.
- **Metric keys** (`metric=`; `y_` prefix also accepted, legacy `y` = `tpPerGpu`):
  - Throughput/GPU: `tpPerGpu`, `inputTputPerGpu`, `outputTputPerGpu`
  - Throughput/MW: `tpPerMw`, `inputTputPerMw`, `outputTputPerMw`
  - Cost $/M tok (total): `costh`, `costn`, `costr` (h = Owning-Hyperscaler,
    n = Owning-Neocloud Giant, r = 3-yr rental)
  - Cost $/M tok (output): `costhOutput`, `costnOutput`, `costrOutput`; (input): `costhi`, `costni`, `costri`
  - Tokens/$ (total): `tokensPerDollarH` (**global default**), `tokensPerDollarN`, `tokensPerDollarR`
    (+ `...Output` / `...Input` variants for H/N/R)
  - Token revenue: `tokenRevenuePerGpuHour` ($/GPU/hr at normalized pricing)
  - Energy: `jTotal`, `jOutput`, `jInput` (J/token)
  - Measured power: `measuredAvgPower`, `measuredPrefillAvgPower`, `measuredDecodeAvgPower`,
    `measuredJPerOutputToken`, `measuredJPerInputToken`, `measuredJPerTotalToken`,
    `measuredJPerSuccessfulQuery`, `measuredWhPerSuccessfulQuery`, `measuredPowerPercentTdp`
- **Percentiles**: `p75`, `p90` (default `p90`).
- **Vendors**: `NVIDIA`, `AMD`. **Deployment**: `single-node`, `multi-node`, `disagg`.
  **Spec-decode**: `mtp`, `stp`.

---

## Views API

### GET /api/v1/views/options — `get-view-options`

Discovery of every option domain. Call this first.

| Param    | Required | Type | Allowed | Default |
| -------- | -------- | ---- | ------- | ------- |
| `format` | no       | enum | `json`  | `json`  |

Response payload: `{ models: [{name, dbKeys, category, releaseDate, compareSlug}],
sequences: [{key, urlSegment, isl, osl, kind, deprecated}], precisions: [...],
hardware: [{key, label, vendor, arch, tdpW, costPerHour: {h, n, r}}],
frameworks: [{key, label, family}], specMethods, percentiles, xAxisModes, scaleModes,
metrics: [{key, configKey, label, labelZh, unit, polarity, group, source}],
quickFilters: {vendors, frameworkFamilies, deployments, specModes}, reliabilityRanges,
overview: {tiers, hardware, engines, windows, scenarios},
calculator: {modes, costProviders, costTypes, defaults}, fleet: {metrics, defaults},
defaults: {model, metric, percentile, ...} }`. Static — no DB reads.

### GET /api/v1/views/inference — `get-inference-view`

Chart-ready scatter series (dedupe → transform → percentile remap → derived fields →
quick filters → GPU filter → Pareto/best flags → grouped by hwKey).

| Param        | Required | Type   | Allowed / format                                                                        | Default                                              |
| ------------ | -------- | ------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `model`      | **yes**  | enum   | display model name or compare-slug alias                                                | —                                                    |
| `sequence`   | no       | enum   | `1k/1k`, `1k/8k`, `8k/1k`, `agentic-traces` (also `1k-1k`, `1k-8k`, `8k-1k`, `agentic`) | `8k/1k` (documented, deterministic)                  |
| `precisions` | no       | CSV    | `fp4,fp8,bf16,int4`                                                                     | auto: densest precision with data for model+sequence |
| `metric`     | no       | enum   | metric keys above (accepts `y_` prefix)                                                 | `tokensPerDollarN`                                   |
| `xmode`      | no       | enum   | `interactivity`, `ttft`, `e2e`, `e2e-normalized-interactivity` (agentic-only)           | `interactivity`                                      |
| `xmetric`    | no       | enum   | TTFT percentile key, e.g. `p90_ttft`                                                    | `p90_ttft`                                           |
| `percentile` | no       | enum   | `p75`, `p90`                                                                            | `p90`                                                |
| `date`       | no       | date   | `YYYY-MM-DD` (as-of)                                                                    | latest                                               |
| `runId`      | no       | string | GitHub workflow run id                                                                  | latest                                               |
| `gpus`       | no       | CSV    | hwKeys or bare GPU base keys                                                            | all                                                  |
| `vendors`    | no       | CSV    | `NVIDIA`, `AMD`                                                                         | all                                                  |
| `frameworks` | no       | CSV    | framework families `vllm,sglang,trt,atom`                                               | all                                                  |
| `deployment` | no       | CSV    | `single-node`, `multi-node`, `disagg`                                                   | all                                                  |
| `spec`       | no       | CSV    | `mtp`, `stp` (ignored on agentic)                                                       | all                                                  |
| `optimal`    | no       | bool   | `true` → Pareto-frontier points only                                                    | `false` (all points; each carries `frontier` flag)   |
| `best`       | no       | bool   | `true` → best series per SKU                                                            | `false`                                              |
| `format`     | no       | enum   | `json`, `csv`                                                                           | `json`                                               |

Response payload:
`{ metric: {key, label, unit, polarity, direction}, xAxis: {mode, label},
series: [{hwKey, gpu, framework, specMethod, label, vendor, deployment, kvOffload,
points: [{x, y, concurrency, tp, date, runId, frontier, bestPerSku, metrics: {...raw ints}}]}],
count }`. CSV: one row per point with series columns flattened.

### GET /api/v1/views/historical — `get-historical-view`

Trend lines: per snapshot date per hwKey, the metric value interpolated at a fixed target
interactivity (monotone-cubic Hermite over the per-date Pareto frontier).

| Param                                            | Required | Type   | Allowed / format          | Default            |
| ------------------------------------------------ | -------- | ------ | ------------------------- | ------------------ |
| `model`                                          | **yes**  | enum   | display model / alias     | —                  |
| `sequence`                                       | no       | enum   | as inference              | `8k/1k`            |
| `precisions`                                     | no       | CSV    | as inference              | auto               |
| `metric`                                         | no       | enum   | metric keys               | `tokensPerDollarN` |
| `target`                                         | no       | number | interactivity tok/s/user  | `35`               |
| `percentile`                                     | no       | enum   | `p75`, `p90`              | `p90`              |
| `start` / `end`                                  | no       | date   | `YYYY-MM-DD` range bounds | full history       |
| `gpus` / `vendors` / `frameworks` / `deployment` | no       | CSV    | as inference              | all                |
| `format`                                         | no       | enum   | `json`, `csv`             | `json`             |

Response payload: `{ metric, target, series: [{hwKey, label, points: [{date, value, clamped}]}] }`.
CSV rows: `date,hwKey,value`.

### GET /api/v1/views/calculator — `get-calculator-view`

Interpolated operating point per hardware config (throughput calculator).

| Param          | Required | Type   | Allowed / format                                             | Default                       |
| -------------- | -------- | ------ | ------------------------------------------------------------ | ----------------------------- |
| `model`        | **yes**  | enum   | display model / alias                                        | —                             |
| `sequence`     | no       | enum   | as inference                                                 | `8k/1k`                       |
| `precisions`   | no       | CSV    | as inference                                                 | auto                          |
| `target`       | no       | number | target interactivity (or tok/s/GPU in reverse mode)          | `35`                          |
| `mode`         | no       | enum   | `interactivity-to-throughput`, `throughput-to-interactivity` | `interactivity-to-throughput` |
| `costProvider` | no       | enum   | `costh`, `costn`, `costr`                                    | `costh`                       |
| `costType`     | no       | enum   | `total`, `input`, `output`                                   | `total`                       |
| `percentile`   | no       | enum   | `p75`, `p90`                                                 | `p90`                         |
| `mw`           | no       | number | facility megawatts (>0) → adds `fleet` sizing per hardware   | unset                         |
| `costcap`      | no       | number | cost cap $/M tok (>0)                                        | unset                         |
| `date`         | no       | date   | `YYYY-MM-DD`                                                 | latest                        |
| `runId`        | no       | string | run id                                                       | latest                        |
| `gpus`         | no       | CSV    | hwKeys / GPU base keys                                       | all                           |
| `format`       | no       | enum   | `json`, `csv`                                                | `json`                        |

Response payload: a `hardware` array with one entry per hardware config, each
`{ hwKey, label, precision, resultKey, value, concurrency, inputThroughput, outputThroughput,
inputTokenShare, cacheHitRate, cost: {total, input, output}, tpPerMw, inputTpPerMw, outputTpPerMw,
clamped, clampedAbove, clampedBelow, nearest: {below, above},
fleet?: {chips, totalTokPerSec, concurrentUsers, costPerHour, costPerMonth} }`
(`fleet` present only when `mw` is set; `nearest.below`/`.above` are the measured
operating points bracketing the interpolated target).

### GET /api/v1/views/fleet — `get-fleet-view`

Fleet lifecycle economics (revenue/margin per month with availability derating and ramp).

| Param        | Required | Type   | Allowed / format                                                        | Default             |
| ------------ | -------- | ------ | ----------------------------------------------------------------------- | ------------------- |
| `model`      | **yes**  | enum   | display model / alias                                                   | —                   |
| `sequence`   | no       | enum   | as inference                                                            | `8k/1k`             |
| `precisions` | no       | CSV    | as inference                                                            | auto                |
| `mw`         | **yes**  | number | facility megawatts, must be > 0                                         | —                   |
| `price`      | no       | number | input-token price $/M                                                   | derived (output/4)  |
| `oprice`     | no       | number | output-token price $/M                                                  | derived (input×4)   |
| `ramp`       | no       | number | ramp months                                                             | `3`                 |
| `cache`      | no       | number | cached-input price as % of input price (agentic)                        | `10`                |
| `mtbi`       | no       | number | mean time between interrupts, **days**                                  | `24`                |
| `recovery`   | no       | number | recovery time, **hours**                                                | `12`                |
| `horizon`    | no       | number | horizon months                                                          | measured run window |
| `metric`     | no       | enum   | `margin`, `marginPerMw`, `revenue`, `revenuePerMw`, `cumulativeRevenue` | `margin`            |
| `percentile` | no       | enum   | `p75`, `p90`                                                            | `p90`               |
| `gpus`       | no       | CSV    | hwKeys / GPU base keys                                                  | all                 |
| `format`     | no       | enum   | `json`, `csv`                                                           | `json`              |

Response payload: `{ assumptions: {...}, series: [{hwKey, label, availability,
breakEvenPricePerMTok, points: [{month, value, revenue, margin, ...}]}] }`.

### GET /api/v1/views/reliability — `get-reliability-view`

Aggregated benchmark success rates per hardware over a date range.

| Param    | Required | Type | Allowed                                                                 | Default         |
| -------- | -------- | ---- | ----------------------------------------------------------------------- | --------------- |
| `range`  | no       | enum | `last-3-days`, `last-7-days`, `last-month`, `last-3-months`, `all-time` | `last-3-months` |
| `format` | no       | enum | `json`, `csv`                                                           | `json`          |

Response payload: `{ range, hardware: [{key, label, successRate, successes, total}],
generatedFrom: {firstDate, lastDate} }`.

### GET /api/v1/views/evaluation — `get-evaluation-view`

Aggregated evaluation scores per hardware config for one benchmark task.

| Param       | Required | Type   | Allowed                                           | Default                       |
| ----------- | -------- | ------ | ------------------------------------------------- | ----------------------------- |
| `model`     | **yes**  | enum   | display model / alias                             | —                             |
| `benchmark` | no       | string | eval task key (e.g. `gsm8k`, `gpqa`)              | first available for the model |
| `date`      | no       | date   | `YYYY-MM-DD` — nearest available date is resolved | latest                        |
| `format`    | no       | enum   | `json`, `csv`                                     | `json`                        |

Response payload: `{ benchmarks: [...available task keys],
rows: [{hwKey, label, score, stderr?, n, precision, framework}] }`.

### GET /api/v1/views/gpu-specs — `get-gpu-specs-view`

Static GPU spec sheet.

| Param    | Required | Type | Allowed                                                                                                                                                            | Default |
| -------- | -------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `metric` | no       | enum | `memory`, `memoryBandwidth`, `fp4`, `fp8`, `bf16`, `scaleUpBandwidth`, `scaleUpWorldSize`, `domainMemory`, `domainMemoryBandwidth` → adds per-chip numeric ranking | unset   |
| `format` | no       | enum | `json`, `csv`                                                                                                                                                      | `json`  |

Response payload: `{ chips: [{key, label, vendor, memoryGB, memoryBandwidthTBs, fp4Tflops,
fp8Tflops, bf16Tflops, tdpW, scaleUpBandwidth, scaleUpWorldSize, domainMemory,
domainMemoryBandwidth, ...raw spec fields}], metrics: [...metric metadata] }`.

### GET /api/v1/views/overview — `get-overview-view`

Documented equivalent of the /overview cost matrix (workload fixed at ISL 8192 / OSL 1024;
scenarios `single_turn_8k1k` and `agentx`).

| Param     | Required | Type | Allowed                                            | Default     |
| --------- | -------- | ---- | -------------------------------------------------- | ----------- |
| `tier`    | no       | enum | `30`, `50`, `75`, `100`, `150`, `200` (tok/s/user) | `50`        |
| `engine`  | no       | enum | `all`, `community`                                 | `community` |
| `compare` | no       | enum | `hardware`, `7d`, `30d`, `60d`, `90d`              | `hardware`  |
| `ref`     | no       | enum | `b200`, `mi355x`, `b300`, `gb200`, `gb300`         | `b200`      |
| `models`  | no       | enum | `default`, `all`                                   | `default`   |
| `rows`    | no       | enum | `changed`, `all`                                   | `all`       |
| `hwrows`  | no       | enum | `priced`, `all`                                    | `all`       |
| `format`  | no       | enum | `json`, `csv`                                      | `json`      |

Response payload: `{ tiers, scenarios, rows: [{model, scenario, cells: [{hardware, costPerMTok,
config: {framework, precision, ...}, deltaVsRef, history?}]}] }`.
(Note: `/api/v1/overview` without `/views/` is an undocumented page-BFF route — do not use it.)

### GET /api/v1/views/rankings — `get-rankings-view`

| Param      | Required | Type | Allowed                                                   | Default        |
| ---------- | -------- | ---- | --------------------------------------------------------- | -------------- |
| `kind`     | no       | enum | `fastest-gpu`, `cheapest-gpu`                             | `cheapest-gpu` |
| `model`    | no       | enum | display name or compare slug                              | all models     |
| `scenario` | no       | enum | `single_turn_8k1k`, `agentx` (aliases `8k-1k`, `agentic`) | both           |
| `format`   | no       | enum | `json`, `csv`                                             | `json`         |

Response payload: `{ kind, entries: [{model, scenario,
rows: [{rank, hardware, chip, value, unit, framework, precision}]}] }`.

### GET /api/v1/views/compare — `get-compare-view`

Two-GPU comparison table at interactivity tiers.

| Param            | Required | Type       | Allowed                                                             | Default                            |
| ---------------- | -------- | ---------- | ------------------------------------------------------------------- | ---------------------------------- |
| `slug`           | either   | string     | compare slug, e.g. `deepseek-v4-b200-vs-mi355x`                     | —                                  |
| `model` + `gpus` | or       | enum + CSV | model plus **exactly 2** GPU base keys                              | —                                  |
| `scenario`       | no       | enum       | scenario segment (`agentic`, `8k-1k`, `1k-1k`, `1k-8k`) or sequence | availability-based (like the page) |
| `variant`        | no       | enum       | `default`, `per-dollar`, `precision`, `spec-decode`                 | `default`                          |
| `tiers`          | no       | CSV        | interactivity targets                                               | page defaults                      |
| `format`         | no       | enum       | `json`, `csv`                                                       | `json`                             |

Response payload: `{ model, gpus: [a, b], scenario, variant, tiers: [...],
table: [{tier, a: {...}, b: {...}, delta, winner}], summary: {...} }`.

---

## Raw-rows API (stable, pre-existing)

### GET /api/v1/availability — `get-availability`

No params. Returns rows `{ model, isl, osl, precision, hardware, framework, spec_method,
disagg, benchmark_type, date }` — every combination that has benchmark data. Note: `model`
here is the **DB key** (e.g. `dsr1`), not the display name.

### GET /api/v1/benchmarks — `list-benchmarks`

| Param      | Required | Type    | Notes                                                  | Default |
| ---------- | -------- | ------- | ------------------------------------------------------ | ------- |
| `model`    | **yes**  | enum    | display model name                                     | —       |
| `date`     | no       | date    | latest data on or before `YYYY-MM-DD` (unless `exact`) | latest  |
| `exact`    | no       | bool    | require the supplied date exactly                      | `false` |
| `runId`    | no       | integer | numeric GitHub Actions run ID (non-numeric ignored)    | —       |
| `exactRun` | no       | bool    | with numeric `runId`, return only that run             | `false` |

Returns raw benchmark rows; scalar metrics in each row's `metrics` object.
400 `{ "error": "Unknown model" }` for bad models.

### GET /api/v1/benchmarks/history — `list-benchmark-history`

| Param           | Required | Type    | Notes                                                                  | Default   |
| --------------- | -------- | ------- | ---------------------------------------------------------------------- | --------- |
| `model`         | **yes**  | enum    | display model name                                                     | —         |
| `isl`           | cond.    | integer | input sequence length; required unless `benchmarkType=agentic_traces`  | —         |
| `osl`           | cond.    | integer | output sequence length; required unless `benchmarkType=agentic_traces` | —         |
| `benchmarkType` | no       | enum    | `agentic_traces`                                                       | —         |
| `view`          | no       | enum    | `calculator` → trimmed rows (~24% smaller)                             | full rows |

Returns every dated benchmark row for the model + workload.
400 `{ "error": "model, isl, and osl are required" }` when params are missing.

### GET /api/v1/evaluations — `list-evaluations`

No params. Latest-attempt evaluation rows: `{ id, config_id, hardware, framework, model,
precision, spec_method, disagg, is_multinode, prefill_*, decode_*, num_prefill_gpu,
num_decode_gpu, task, date, conc, metrics: {accuracy, ...}, timestamp, run_url }`.

### GET /api/v1/reliability — `list-reliability`

No params. Rows `{ hardware, date, n_success, total }` (raw daily counts — the views
endpoint aggregates these into ranges).

### GET /api/v1/tco-feed — `get-tco-feed`

| Param              | Required | Type   | Notes                                                                    | Default               |
| ------------------ | -------- | ------ | ------------------------------------------------------------------------ | --------------------- |
| `model`            | no       | enum   | DB model key or display name                                             | `dsv4`                |
| `workloads`        | no       | CSV    | `<isl>x<osl>` pairs, pattern `^\d+x\d+(,\d+x\d+)*$`                      | `1024x1024,8192x1024` |
| `tiers`            | no       | CSV    | positive interactivity targets (tok/s/user)                              | `30,50,75,100`        |
| `date`             | no       | date   | data on or before `YYYY-MM-DD`                                           | latest                |
| `view`             | no       | enum   | `points` (row per hardware×workload×tier) or `scores` (row per hardware) | `points`              |
| `weights`          | no       | CSV    | scores only; one non-negative weight per tier, normalized to sum 1       | `0.35,0.4,0.2,0.05`   |
| `workload_weights` | no       | CSV    | scores only; one weight per workload, normalized                         | equal                 |
| `alpha`            | no       | number | scores only; input-token value ratio in [0, 10]                          | `0.25`                |
| `format`           | no       | enum   | `json`, `csv`                                                            | `json`                |

JSON: `{ model, db_model_keys, date, workloads, tiers,
rows: [{hardware, workload, tier, tput_per_gpu, is_interpolated}] }`. CSV: same rows flat.

### GET /api/v1/workflow-info — `get-workflow-info`

| Param           | Required | Type | Notes                 |
| --------------- | -------- | ---- | --------------------- |
| `date`          | **yes**  | date | `YYYY-MM-DD`          |
| `benchmarkType` | no       | enum | e.g. `agentic_traces` |

Returns `{ runs, changelogs, configs, runConfigs }` — run metadata/provenance per day.

### Other published read endpoints (see /api/openapi.json)

`/api/v1/benchmark-siblings`, `/api/v1/submissions`, `/api/v1/framework-releases`,
`/api/v1/latest-images`, `/api/v1/datasets` (+ `{slug}`, `{slug}/conversations` with
`limit`/`offset`/`sort`, `{slug}/conversations/{convId}`), `/api/v1/collectivex/latest`,
`/api/v1/collectivex/runs`, `/api/v1/collectivex/runs/{runId}`, `/api/v1/agentic-aggregates`,
`/api/v1/derived-agentic-metrics`, `/api/v1/request-timeline`, `/api/v1/server-log*`,
`/api/v1/log-availability`, `/api/v1/trace-*`. The machine-readable OpenAPI document is at
`https://inferencex.semianalysis.com/api/openapi.json`.
