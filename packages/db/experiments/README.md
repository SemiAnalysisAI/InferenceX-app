# WEKA AMG / Kimi K3 experiment import

This branch supports the isolated `weka-amg-kimi-k3` campaign in its dedicated Neon child database. It does not insert GitHub workflow IDs or modify published configs, benchmarks, materialized views, or availability.

The manifest retains ten WEKA observations (including existing repeats), six native Mooncake observations, and eleven separate published reference points. C150 is a completed measurement with a recovered missing cache object; its `clean_backend_qualified` and `frontier_eligible` fields are false. No missing-cache outcome is rerun or hidden. Actual dates come from the profiling export, and all point metrics preserve their original aggregate values. `plot_metrics` records the exact PNG normalization and reciprocal P90 full-response ITL.

## Current database state

On November 9, 2026, the child was refreshed from production `main`. The experiment schema is empty; the previous 16 runs and payloads were removed. No newer three-hour measurements have been imported. The committed manifest and `import-receipt.json` document the historical November 2 import and are preserved unchanged. Reapplying that manifest would restore the old one-hour campaign, not ingest the latest results.

## Prepare and import

Run with Bun 1.4. The input manifest stores task-relative artifact paths and hashes. The original archives and absolute local paths remain outside this repository.

```sh
bun packages/db/src/ingest-experiment.ts \
  --manifest packages/db/experiments/weka-amg-kimi-k3.manifest.json \
  --source-root /path/to/weka-amg-agentx-20261028 \
  --prepared-dir /path/to/inferencex-ui-import \
  --prepare-only

bun --env-file=.env.experiment.local packages/db/src/ingest-experiment.ts \
  --manifest packages/db/experiments/weka-amg-kimi-k3.manifest.json \
  --prepared-dir /path/to/inferencex-ui-import \
  --target-receipt packages/db/experiments/child-target.json \
  --apply
```

Only `EXPERIMENT_DATABASE_WRITE_URL` is read by the writer. The endpoint, database, parent, persistent child branch, and project must match the reviewed target receipt and explicit child allowlist. There is no fallback to the normal write connection. `schema.sql` is applied only by this guarded importer; it is not part of the production migration sequence.

Preparation verifies every source file hash and uses the existing trace derivation code to build request timelines, distribution summaries, and server-metric series. The original profile, server-metric JSON, and server log are gzip-compressed into one-MiB database chunks. Import is transactional per run, immutable by record hash, and resumable; a matching second import is a no-op. A changed campaign manifest or conflicting run record is rejected. The campaign becomes visible only after all sixteen records and all payload sizes, chunk counts, and reassembled database SHA256 hashes match. `import-receipt.json` records the actual target and outcome in the local prepared directory.

## Read contract

`src/queries/experiments.ts` exposes campaign, run list, detail, and chunk readers. The detail includes the established `aggregate_stats`, `chart_series`, and `request_timeline` shapes. No API needs access to a Mac path or GitHub artifact. Configuration/provenance metadata is whitelisted; environment variables, command lines, and absolute local paths are not exposed. Raw payloads are stored for reproducibility, but are not included automatically in the campaign response.

Comparison notes retain the 728d versus unavailable 5894 image distinction, native 2-TiB cache and 80-CPU allocation, client-version difference, C150 GPU utilization 0.89 versus 0.90, and measured cache counters versus theoretical throughput normalization. Failure export deltas and log observations remain distinct, including the first-nonzero-sample counter caveat.
