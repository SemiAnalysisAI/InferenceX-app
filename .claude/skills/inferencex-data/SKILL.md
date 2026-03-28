---
name: inferencex-data
description: Download and analyze InferenceX ML inference benchmark data — GPU performance metrics across hardware, frameworks, and models. Use when asked to analyze inference benchmarks, compare GPUs, plot pareto frontiers, or work with InferenceX data.
---

# Setup

Download the latest database dump from GitHub releases:

```bash
gh release download --repo SemiAnalysisAI/InferenceX-app --pattern 'inferencex-dump-*.zip' --dir .
unzip inferencex-dump-*.zip
```

# Data

Each `.json` file corresponds to one database table.

| File                     | Description                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `configs.json`           | Serving deployment configs: hardware + framework + model + precision + parallelism |
| `workflow_runs.json`     | GitHub Actions workflow run metadata                                               |
| `server_logs.json`       | Raw benchmark server logs (~140KB per row, very large — avoid loading entirely)    |
| `benchmark_results.json` | Performance metrics per config/concurrency/sequence-length/date                    |
| `run_stats.json`         | Per-hardware reliability stats (n_success / total)                                 |
| `eval_results.json`      | LM evaluation accuracy results (e.g. gsm8k)                                        |
| `availability.json`      | Denormalized date x config availability                                            |
| `changelog_entries.json` | PR/change descriptions per workflow run                                            |

## Relationships

- `benchmark_results[].config_id` -> `configs[].id`
- `benchmark_results[].workflow_run_id` -> `workflow_runs[].id`
- `benchmark_results[].server_log_id` -> `server_logs[].id` (nullable)
- `eval_results[].config_id` -> `configs[].id`
- `eval_results[].workflow_run_id` -> `workflow_runs[].id`
- `run_stats[].workflow_run_id` -> `workflow_runs[].id`
- `changelog_entries[].workflow_run_id` -> `workflow_runs[].id`

## Config Fields

Each config is a unique serving deployment:

```
id, hardware, framework, model, precision, spec_method, disagg, is_multinode,
prefill_tp, prefill_ep, prefill_dp_attention, prefill_num_workers,
decode_tp, decode_ep, decode_dp_attention, decode_num_workers,
num_prefill_gpu, num_decode_gpu
```

- `tp`: tensor parallelism, `ep`: expert parallelism, `dp_attention`: data parallel attention, `num_workers`: pipeline parallel workers
- `spec_method`: speculative decoding method. `mtp` = multi-token prediction, `none` = standard autoregressive
- `disagg=true` means prefill and decode run on separate GPU pools (disaggregated serving). When `disagg=false`, prefill and decode fields are identical
- Total GPU count = `num_prefill_gpu + num_decode_gpu` for disagg, or just `num_prefill_gpu` for non-disagg

## Benchmark Result Fields

```
id, workflow_run_id, config_id, benchmark_type, date, isl, osl, conc,
image, metrics, error, server_log_id
```

- `benchmark_type`: currently always `single_turn`
- `date`: ISO 8601 timestamp string (e.g. `2025-10-12T00:00:00.000Z`)
- `isl` / `osl`: input/output sequence length in tokens
- `conc`: concurrency level
- `image`: Docker image used for the serving framework (e.g. `lmsysorg/sglang:v0.5.8.post1-cu130`), null for runs before 2025-12-08
- `error`: null means success
- `metrics`: nested JSON object — access as `row["metrics"]["tput_per_gpu"]`, not as top-level fields

## Metrics Keys

All latency values in seconds. `tput_per_gpu` is total throughput (input+output tokens) per second per GPU.

**Throughput**: `tput_per_gpu`
**TTFT** (time to first token): `median_ttft`, `mean_ttft`, `p99_ttft`, `std_ttft`
**TPOT** (time per output token): `median_tpot`, `mean_tpot`, `p99_tpot`, `std_tpot`
**ITL** (inter-token latency): `median_itl`, `mean_itl`, `p99_itl`, `std_itl`
**E2EL** (end-to-end latency): `median_e2el`, `mean_e2el`, `p99_e2el`, `std_e2el`
**Interactivity**: `median_intvty`, `mean_intvty`, `p99_intvty`, `std_intvty`

## Eval Result Fields

```
id, workflow_run_id, config_id, task, date, isl, osl, conc, lm_eval_version, metrics
```

- `task`: evaluation task name (e.g. `gsm8k`)
- `metrics`: nested object with `n_eff`, `em_strict`, `em_flexible`, `em_strict_se`, `em_flexible_se`

## Workflow Run Fields

```
id, github_run_id, run_attempt, name, status, conclusion, head_sha,
head_branch, html_url, created_at, run_started_at, date
```

- `run_attempt`: re-runs of the same `github_run_id` get incrementing attempts. When computing latest results, first filter to the highest `run_attempt` per `github_run_id`.
- `conclusion`: `success`, `failure`, or `cancelled`
- `html_url`: link to the GitHub Actions run

## Run Stats Fields

```
id, workflow_run_id, date, hardware, n_success, total
```

- Reliability rate = `n_success / total` per hardware per run

## Availability Fields

Denormalized table for fast date-picker lookups — one row per (model, isl, osl, precision, hardware, framework, spec_method, disagg, date) combination. Not joined by `config_id`; uses the raw text keys directly.

```
model, isl, osl, precision, hardware, framework, spec_method, disagg, date
```

## Changelog Entry Fields

```
id, workflow_run_id, date, base_ref, head_ref, config_keys, description, pr_link
```

- `config_keys`: array of strings like `["dsr1-fp8-mi355x-mori-sglang"]` identifying which configs changed
- `pr_link`: GitHub PR URL (nullable)

## ETL Normalization

Framework names are normalized during ingest: `dynamo-trtllm` -> `dynamo-trt`, `sglang-disagg` -> `mori-sglang`. The dump contains already-normalized values.

## Enum Values

**hardware**: h100, h200, b200, b300, gb200, gb300, mi300x, mi325x, mi355x
**model**: dsr1=DeepSeek-R1-0528, gptoss120b=gpt-oss-120b, llama70b=Llama-3.3-70B-Instruct-FP8, qwen3.5=Qwen-3.5-397B-A17B, kimik2.5=Kimi-K2.5, minimaxm2.5=MiniMax-M2.5, glm5=GLM-5
**framework**: atom, dynamo-sglang, dynamo-trt, mori-sglang, sglang, trt, vllm
**precision**: bf16, fp4, fp8, int4
**spec_method**: mtp, none

# Analysis Recipes

- **Load data**: Parse `configs.json` and `benchmark_results.json`, join on `config_id`, filter out rows where `error` is not null.
- **Latest per config**: First filter `workflow_runs` to the highest `run_attempt` per `github_run_id`, then join to `benchmark_results`. For each unique `(config_id, conc, isl, osl)`, keep only the row with the latest `date`.
- **Pareto frontier (chip vs chip)**: Fix a model/concurrency/sequence length. Plot throughput (x) vs median TTFT (y) per hardware. The pareto frontier connects points that dominate all others (higher throughput AND lower latency). Sort by descending throughput, greedily collect points with improving latency.
- **Pareto frontier (date vs date)**: Fix a hardware/model/concurrency/sequence length. Plot throughput and latency over time to see how performance evolves across benchmark dates.
