# OperatorX

**English** | [中文](operatorx_zh.md)

OperatorX is a feature-gated dashboard alongside CollectiveX in **Hidden**. The
existing ↑↑↓↓ unlock exposes both tabs. `/operatorx` and `/zh/operatorx` share the
same reader, chart, filters, and coverage. `?run=<run key>` opens a
specific stored run.

The view covers single-GPU GEMM (`gemm`, `gemm_perf`), MHA/GQA materialized MLA (`attention`, `attention_perf`), and routed MoE (`moe_gemm`) on NVIDIA and AMD, including the AMD AITER backend. The
reader matches every requested case/backend against its newest shard attempt,
retains earlier shards in partial reruns, validates source/run/attempt/cluster
metadata, and separates measured, unsupported, failed, and missing rows. Zero-size
GEMMs have no throughput value. Attention reports latency in µs and useful matmul TFLOPS. MLA measures materialized Q/K/V
attention only; cache projection and RoPE are excluded. PyTorch expands grouped KV
before timing; AITER retains native grouped heads. Compare identical shapes,
precisions, and backends. Other operators remain outside this view.

Cross-run comparisons select the newest available result per GPU, case, and backend.
An explicit error or unsupported result remains visible; a missing result can be
filled by an older stored run. Kernel timelines are read from the result's stored
run, so opening a profile still works after a newer comparison replaces that row.
Timeline references include the stored revision. Re-ingesting the same run replaces
that revision, so a new comparison cannot open a cached timeline from the old data.

GEMM TFLOPS is `2*M*N*K/(latency_us*1e6)`, per GPU. An eight-GPU Slurm allocation does
not multiply this number. The UI preserves A/B/output precision, latency, shape,
backend, cluster, source commit, run identity, and diagnostic messages. The operator selector keeps GEMM and each attention family and routed MoE separate. Attention defaults
to TFLOPS versus batch size, with a latency selector, and preserves query/KV lengths, head counts, head
dimensions, KV rank, causality, and Q/K/V/output precision. API dataset version 3 adds `moe_gemm` and nullable `moe` dimensions alongside `type`, original `args`, and nullable `attention`. Inapplicable operator fields are null. Existing raw bundles are read without schema migration; summary caches from earlier reader versions are rebuilt from persisted documents on the next run-list read, including previously omitted MoE coverage. Throughput is derived from measured latency on read. The chart
shows successful measurements; the status filter exposes the other cases.

## Attention TFLOPS

Per-GPU TFLOPS is `2*B*Hq*P*(Dqk+Dv)/(latency_us*1e6)`.
`P` counts visible query/key pairs per head: `Sq*Sk` without a causal mask;
with bottom-right causality, `R*(2*Sk-R+1)/2`, where `R=min(Sq,Sk)`.
This includes the diagonal, counts all KV for single-token decode, and excludes
fully masked leading rows when `Sq>Sk`. It follows the valid-pair accounting in
[AITER’s prefill benchmark](https://github.com/ROCm/aiter/blob/main/op_tests/op_benchmarks/triton/bench_batch_prefill.py).

Two FLOPs are counted per multiply-add in QK and AV. GQA uses query heads, not KV
heads. MLA uses `Dqk=head_dim_qk_nope+head_dim_qk_rope` and `Dv=head_dim_v`;
`kv_lora_rank` does not add work to materialized attention. This is useful matmul
throughput, not an instruction count or hardware utilization measurement. Softmax,
projection, RoPE and masked work are excluded from the numerator; the denominator
remains the measured attention latency. Failed, unsupported, missing, and empty
cases have null TFLOPS. Kernel timing and saved measurements are unchanged.

## Routed MoE and the Kimi K3 benchmark profile

MoE charts use local token count on the x-axis and show per-GPU TFLOPS or latency.
Each point preserves the profile name, activation/weight precision, hidden size,
global and local expert/intermediate dimensions, top-k, EP, routed/shared TP,
shared expert count, and routing distribution. Select identical shapes before comparing GPUs.

The `kimi_k3_moe_perf` testlist follows the generic dimensions in
[vLLM PR #50082](https://github.com/vllm-project/vllm/pull/50082): H=7168,
I=3072, E=896 and top-k=16, with local tokens 1/16/128/1024. EP8 uses 112 local
experts and I=3072; TP8 uses 896 experts and local I=384. These are single-GPU
weight shapes, not live distributed groups. All selected routes target local experts;
routing is prepared before timing. No communication is measured.

This profile runs generic SiLU experts, not the native K3 MoE layer. Native K3 uses
SITU, routed hidden size 3584, latent projections, and shared experts; those are
outside this profile. The profile name remains visible so its measurements cannot
be mistaken for full-model throughput.

Useful gate/up/down matmul TFLOPS is
`6*T*H*(top_k*I_local+n_shared*I/shared_TP)/(latency_us*1e6)`.
`I_local=I/routed_TP`; EP changes local expert storage and is not divided out again.
The K3 profile has `n_shared=0`. The numerator excludes activation and routing work;
the denominator is the measured fused expert kernel latency. Missing, failed,
unsupported, and empty cases have no TFLOPS value.

## Persistence and deployment

Runs live in a separate OperatorX database (`opx_runs` and `opx_run_docs`) as raw
documents: each run's manifest and every shard's operatorx results JSON, verbatim.
The normalizer turns them into the dashboard's dataset at read time; it also runs once
at ingest, so a run that cannot be read is never stored. Runs arrive by push:

- `bun run admin:db:ingest:operatorx -- --download <run-url-or-id>` stores a completed
  `operatorx-sweep.yml` run (any branch), downloading its manifest and shard artifacts.
- In CI, `admin:db:ingest:operatorx:ci` reads pre-downloaded artifacts from
  `INGEST_ARTIFACTS_PATH` for `INGEST_RUN_ID`.
- `bun run admin:db:ingest:operatorx -- --bundle <file.json> ...` stores raw bundles
  as they are, for runs collected outside a sweep.

Re-ingesting a run replaces it. Setup:

When a dispatched InferenceX `operatorx-sweep.yml` run finishes, including one with
failed shards, it sends an `ingest-operatorx` repository dispatch with its run ID, and
the `Ingest OperatorX Results` workflow stores that run. GitHub delivers repository
dispatches only to workflows on the default branch, so this starts working once
`ingest-operatorx.yml` is on InferenceX-app's default branch. Run the workflow manually
with a run ID to backfill or re-ingest a run.

1. `DATABASE_OPERATORX_WRITE_URL`: the owner connection (direct, non-pooled), for
   migrations and ingest only.
2. `DATABASE_OPERATORX_READONLY_URL`: a read-only role on the pooled endpoint; the
   only connection the app uses.
3. Run `bun run admin:db:migrate:operatorx -- --yes` before deployment.

## Local verification

With `OPERATORX_SOURCE=local`, `OPERATORX_LOCAL_ARTIFACT_DIR` points at a directory of
`<runKey>.json` raw bundles. This works only in development; production ignores it.
Do not replace measured latencies with synthetic values for manual verification.
