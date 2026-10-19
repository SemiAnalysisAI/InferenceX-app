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
