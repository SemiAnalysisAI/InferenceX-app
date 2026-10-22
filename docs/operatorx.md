# OperatorX

OperatorX is a feature-gated dashboard alongside CollectiveX in **Hidden**. The
existing ↑↑↓↓ unlock exposes both tabs. `/operatorx` and `/zh/operatorx` share the
same reader, chart, filters, and coverage.

The view compares single-GPU GEMM and routed MoE operator timings on NVIDIA and AMD. The
reader matches every requested case/backend against the stored shards, and ingest keeps each
shard's newest attempt, so partial reruns retain earlier shards. Rows are separated into
measured, unsupported, failed, and missing. Zero-size GEMMs have no throughput value.

Cross-run comparisons select the newest available result per GPU, case, and backend.
An explicit error or unsupported result remains visible; a missing result can be
filled by an older stored run. Kernel timelines are read from the result's stored
run, so opening a profile still works after a newer comparison replaces that row.
Timeline references include the stored revision. Re-ingesting the same run replaces
that revision, so a new comparison cannot open a cached timeline from the old data.

TFLOPS is computed on read as useful FLOPs (`usefulFlops()` in
`packages/db/src/operatorx/describe.ts`, `2*M*N*K` for GEMM) divided by
`latency_us*1e6`, per GPU. An eight-GPU Slurm allocation does not multiply this number.
Charts plot only successful measurements. The coverage strip counts the other cases per GPU.

## Ascend 950PR normalization

The OperatorX-only hardware reference for `ascend950pr` uses the 28-Cube
Ascend950PR_9579 basis in `Ascend-ubench.md` (hardware configuration and section 5):
378 dense BF16 TFLOPS and **assumed** HBM bandwidth of 1.6 TB/s. The compute value
is Cube-only (Huawei Ascend 950 white paper, table 3-1), excluding the Vector
contribution in the 425 TFLOPS combined figure. Exact memory/ECC configuration
remains unresolved; the chart states this qualification. Other precision ceilings
remain null. The normalized roofline divides arithmetic intensity by 236.25
FLOP/byte and throughput by 378 TFLOPS; raw measurements are unchanged.

`GET /api/v1/operatorx/compare?op=gemm` includes an optional `hardware[].reference`
object with `label`, nullable `peakTflops.{bf16,fp8,fp4}`, `memoryBandwidthTBs`,
`memoryBandwidthAssumed`, `source`, and `qualification`. UI helpers and the
page-owned API use the same reference. This endpoint remains a `page-bff`, outside
the published OpenAPI contract. Unknown hardware gets no reference. Ascend uses a
cool crimson in light/dark charts, distinct from AMD's warm reds; color is a
presentation-only control with no numerical API effect.

### 中文说明

`ascend950pr` 的参考值仅用于 OperatorX，依据 `Ascend-ubench.md` 的硬件配置说明和第 5 节，
以 28 个 Cube 核的 Ascend950PR_9579 为基准：BF16 稠密计算峰值为 378 TFLOPS，
HBM 带宽**假定为** 1.6 TB/s。计算峰值取自华为 Ascend 950 白皮书表 3-1 中的 Cube 项，
不包含 425 TFLOPS 合计值中的 Vector 算力。具体内存及 ECC 配置仍未确认，图表会显示此说明。
其他精度的峰值保留为 null。归一化时，算术强度除以 236.25 FLOP/byte，吞吐量除以
378 TFLOPS；实测数据不变。

`GET /api/v1/operatorx/compare?op=gemm` 的响应在 `hardware[].reference` 中提供可选的参考值对象：
`label`、允许为 null 的 `peakTflops.{bf16,fp8,fp4}`、`memoryBandwidthTBs`、
`memoryBandwidthAssumed`、`source` 和 `qualification`。UI 与页面专属 API 共用参考值。
该接口仍属于 `page-bff`，不纳入公开 OpenAPI 契约；未知硬件不返回参考值。
Ascend 在浅色和深色图表中使用偏冷的深红色，与 AMD 的暖红色区分；颜色仅影响展示，不改变 API 数值。

## Persistence and deployment

Runs live in a separate OperatorX database (`opx_runs` and `opx_run_docs`) as raw
documents: each run's manifest and every shard's operatorx results JSON, verbatim.
The normalizer turns them into the dashboard's dataset at read time; it also runs once
at ingest, so a run that cannot be read is never stored. Runs arrive by push:

- `bun run admin:db:ingest:operatorx -- --download <run-url-or-id>` stores a completed
  `operatorx-sweep.yml` run (any branch), downloading its manifest and shard artifacts.
- `admin:db:ingest:operatorx:ci` (no flag) reads pre-downloaded artifacts from
  `INGEST_ARTIFACTS_PATH` for `INGEST_RUN_ID`.
- `bun run admin:db:ingest:operatorx -- --bundle <file.json> ...` stores raw bundles
  as they are, for runs collected outside a sweep.

Re-ingesting a run replaces it.

When a dispatched InferenceX `operatorx-sweep.yml` run finishes, including one with
failed shards, it sends an `ingest-operatorx` repository dispatch with its run ID, and
the `Ingest OperatorX Results` workflow stores that run. GitHub delivers repository
dispatches only to workflows on the default branch. Run the workflow manually with a run
ID to backfill or re-ingest a run. OperatorX API responses stay cached until the workflow,
after storing a run, purges them with `/api/v1/invalidate?scope=operatorx`.

Setup:

1. `DATABASE_OPERATORX_WRITE_URL`: the owner connection (direct, non-pooled), for
   migrations and ingest only.
2. `DATABASE_OPERATORX_READONLY_URL`: a read-only role on the pooled endpoint; the
   only connection the app uses.
3. Run `bun run admin:db:migrate:operatorx -- --yes` before deployment.

## Local verification

With `OPERATORX_SOURCE=local`, `OPERATORX_LOCAL_ARTIFACT_DIR` points at a directory of
`<runKey>.json` raw bundles. This works only in development; production ignores it.
Do not replace measured latencies with synthetic values for manual verification.
