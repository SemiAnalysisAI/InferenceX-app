# WEKA AMG / Kimi K3 experiment import

This branch supports the latest three-hour `weka-amg-kimi-k3-latest-3h` campaign in its dedicated Neon child database. It does not insert GitHub workflow IDs or modify published configs, benchmarks, materialized views, or availability.

The current manifest contains 13 latest-WEKA and nine internal Mooncake runs. Actual dates come from the profiling export, and point metrics preserve their original aggregate values. `plot_metrics` records normalized throughput and reciprocal P90 full-response ITL. The separate historical `weka-amg-kimi-k3` manifest remains archived.

## Current database state

On November 9, 2026, the child was refreshed from production `main`, removing the previous 16 runs and payloads. The original manifest and `import-receipt.json` document the historical November 2 import and are preserved unchanged. Reapplying that manifest would restore the old one-hour campaign.

The separate `weka-amg-kimi-k3-latest-3h.manifest.json` contains 13 latest-WEKA measurements and nine internal B300 Mooncake measurements. Every run uses a 10,800-second send window and 1,200-second trace-idle cap; no published one-hour reference is included. All 22 measurements are retained. WEKA C128 has a metric-integrity flag and C140/C180 have DRAM-recovery flags; those three remain outside the clean frontier. Internal direct/stock KV, query-gather, CUDA-graph and SDK variants remain in each run's configuration. The baseline curve may pool those variants, but is not one fixed configuration.

`build-latest-weka-manifest.py --source-root /path/to/artifact-parent` verifies the canonical final plot, qualification and archived source hashes. The parent directory must contain both `weka-amg-kda-dram-idle1200-3h-20261104` and `weka-amg-idle1200-3h-20261103`. The resulting manifest contains relative artifact paths, not credentials, environment dumps or local absolute paths.

## Prepare and import

Run with Bun 1.4. The input manifest stores task-relative artifact paths and hashes. The original archives and absolute local paths remain outside this repository.

```sh
bun packages/db/src/ingest-experiment.ts \
  --manifest packages/db/experiments/weka-amg-kimi-k3-latest-3h.manifest.json \
  --source-root /path/to/artifact-parent \
  --prepared-dir /path/to/inferencex-ui-import-latest-3h \
  --prepare-only

bun --env-file=.env.experiment.local packages/db/src/ingest-experiment.ts \
  --manifest packages/db/experiments/weka-amg-kimi-k3-latest-3h.manifest.json \
  --prepared-dir /path/to/inferencex-ui-import-latest-3h \
  --target-receipt packages/db/experiments/child-target.json \
  --apply
```

Only `EXPERIMENT_DATABASE_WRITE_URL` is read by the writer. The endpoint, database, parent, persistent child branch, and project must match the reviewed target receipt and explicit child allowlist. There is no fallback to the normal write connection. `schema.sql` is applied only by this guarded importer; it is not part of the production migration sequence.

Preparation extracts only the three selected raw members from one verified archive at a time, validates each member's hash, and removes the temporary extraction afterward. A disk-space guard reserves another 2 GiB beyond that run's extraction size.

Preparation verifies every source file hash and uses the existing trace derivation code to build request timelines, distribution summaries, and server-metric series. The original profile, native server-metric JSON, and server log are gzip-compressed into one-MiB database chunks. Import is transactional per run, immutable by record hash, and resumable; a matching second import is a no-op. A changed campaign manifest or conflicting run record is rejected. The campaign becomes visible only after every expected record, qualification flag, payload size, chunk count and reassembled database SHA256 matches. `import-receipt.json` records the actual target and outcome in the local prepared directory.

## Read contract

`src/queries/experiments.ts` exposes campaign, run list, detail, and chunk readers. The detail includes the established `aggregate_stats`, `chart_series`, and `request_timeline` shapes. No API needs access to a Mac path or GitHub artifact. Configuration/provenance metadata is whitelisted; environment variables, command lines, and absolute local paths are not exposed. Raw payloads are stored for reproducibility, but are not included automatically in the campaign response.

The historical one-hour campaign notes retain the 728d versus unavailable 5894 image distinction, native 2-TiB cache and 80-CPU allocation, client-version difference, C150 GPU utilization 0.89 versus 0.90, and measured cache counters versus theoretical throughput normalization. Failure export deltas and log observations remain distinct, including the first-nonzero-sample counter caveat.
