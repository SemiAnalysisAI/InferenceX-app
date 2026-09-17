# OperatorX

**English** | [中文](operatorx_zh.md)

OperatorX is a feature-gated dashboard alongside CollectiveX in **Hidden**. The
existing ↑↑↓↓ unlock exposes both tabs. `/operatorx` and `/zh/operatorx` share the
same reader, chart, filters, and coverage. `?run=<GitHub Actions run ID>` opens a
specific run, including a feature-branch run.

The view covers single-GPU GEMM (`gemm`, `gemm_perf`), MHA/GQA and materialized
MLA (`attention`, `attention_perf`) on NVIDIA and AMD, including the AMD AITER backend. The
reader matches every requested case/backend against its newest shard attempt,
retains earlier shards in partial reruns, validates source/run/attempt/cluster
metadata, and separates measured, unsupported, failed, and missing rows. Zero-size
GEMMs have no throughput value. Attention reports latency in µs, with null TFLOPS. MLA measures materialized Q/K/V
attention only; cache projection and RoPE are excluded. PyTorch expands grouped KV
before timing; AITER retains native grouped heads. Compare identical shapes,
precisions, and backends. Other operators remain outside this view.

TFLOPS is `2*M*N*K/(latency_us*1e6)`, per GPU. An eight-GPU Slurm allocation does
not multiply this number. The UI preserves A/B/output precision, latency, shape,
backend, cluster, source commit, run identity, and diagnostic messages. The operator selector keeps GEMM and each attention family separate. Attention defaults
to latency versus batch size and preserves query/KV lengths, head counts, head
dimensions, KV rank, causality, and Q/K/V/output precision. API dataset version 2
adds `type`, original `args`, and nullable `attention`; GEMM-specific fields are
null for attention. Existing raw bundles are read without schema migration; old GEMM-only summary caches
are rebuilt from persisted documents on the next run-list read. The chart
shows successful measurements; the status filter exposes the other cases.

## Persistence and deployment

Like CollectiveX, API reads lazily discover completed manual runs on any branch
and preserve raw documents beyond GitHub's 14-day artifact retention. Discovery
looks back 44 days to include reruns and imports at most four runs per request;
the client follows `discovery_complete=false`. It checks the exact OperatorX
workflow identity and downloads only manifest/result documents from bounded ZIPs.

1. Set `GITHUB_TOKEN` with Actions artifact read access.
2. Set `DATABASE_OPERATORX_WRITE_URL` to a write-capable PostgreSQL primary. A
   separate database is recommended; `opx_runs` is also namespaced if colocated.
3. Run `bun run admin:db:migrate:operatorx -- --yes` before deployment.

One row atomically stores the raw bundle and summary. An older concurrent ingest
cannot replace a newer run attempt. Reads use the same primary. During GitHub
outages, stored runs remain available. Unviewed artifacts that expire cannot be
recovered. There is no cross-repository dispatch or automated production migration.

Public endpoints `/api/v1/operatorx/runs` and `/api/v1/operatorx/runs/{runId}` are
documented in the bilingual API reference and OpenAPI registry. Completed discovery
and run responses have a 60-second CDN TTL; incomplete discovery is uncached.

## Local verification with actual artifacts

Set `OPERATORX_LOCAL_ARTIFACT_DIR` to a directory containing `<runId>.json` bundles
returned by `downloadOperatorXBundle` in `src/lib/operatorx-ingest.ts`. This explicitly
opted-in preview works only in development on loopback URLs. Production ignores the
setting. The preview uses the same validating reader and UI as persisted data; do
not replace measured latencies with synthetic values for manual verification.

The reader and ingest tests cover FLOP arithmetic, unsupported/missing cases, reruns,
provenance, ZIP loading, and duplicate rejection. The persistence test executes the
actual migration and queries in PGlite. The Cypress spec covers filters, hidden
navigation, Chinese controls, and mobile rendering.
