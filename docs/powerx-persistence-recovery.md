# PowerX persistence and recovery

Use this runbook to deploy PowerX storage, recover missing telemetry, or undo a data
correction. Run commands from the repository root with credentials for the intended
target. The application and ingest process must use the same database.

## Deploy

Check the target migration ledger and apply pending migrations before running writers:

```sh
bun run admin:db:migrate --yes
```

PowerX requires `016_gpu_metrics.sql` and `017_gpu_metric_stats_version.sql` in order.
Writers depend on the `stats_version` column from 017. CI ingest workflows migrate
automatically; manual backfill does not. Deploy compatible application and writer code.

## Repair a run

Retain the original receipt, artifact bytes and sidecars with their exact source run
and attempt. Before correction, snapshot the affected series, samples, digests, point
links and any benchmark audits the repair may update. Set `DATABASE_WRITE_URL` and
`GITHUB_TOKEN` for the intended target, then preview the named artifact:

```sh
bun run admin:db:backfill-gpu-metrics --run RUN_ID --attempt ATTEMPT \
  --artifact EXACT_ARTIFACT_NAME --dry-run
```

For a backfill that fills missing AgentX `power_audit`, also set
`CACHE_INVALIDATE_URL=https://TARGET_ORIGIN/api/v1/invalidate` and
`CACHE_INVALIDATE_SECRET` or `INVALIDATE_SECRET`. Protected previews need
`CACHE_PROTECTION_BYPASS_SECRET`. Use the app's existing cache namespace.

Repair the artifact and merge the existing receipt:

```sh
bun run admin:db:backfill-gpu-metrics --run RUN_ID --attempt ATTEMPT \
  --artifact EXACT_ARTIFACT_NAME --receipt /path/power-publication.json --yes
```

Unchanged inputs are no-ops. GitHub backfill accepts only the current source attempt.
An unchanged AMD DME artifact can correct a stored NVIDIA vendor label without
replacing its samples, statistics or point links. The series revision then refreshes
point reads once. Current DME bundles identify AMD by `gpu_power_usage` and its
`gpu_device_power_as_reported_by_amd_device_metrics_exporter` scope; older bundles
use `power_profile: amd-device-metrics`. Both retain their original manifest bytes.
Older or expired artifacts require retained original bytes; never substitute another
attempt's artifacts. For local recovery, set `INGEST_RUN_ID`, `INGEST_RUN_ATTEMPT`,
`INGEST_REPO=SemiAnalysisAI/InferenceX`, `INGEST_ARTIFACTS_PATH` and
`POWER_PUBLICATION_MANIFEST`, then run `bun run admin:db:ingest:ci` with the same
credentials. Inspect `reused-ingest-metadata/reuse_source_run.json` first if present;
it overrides the run/attempt identity. Apply sidecar corrections to the retained tree.

After AgentX audit updates, backfill refreshes `latest_benchmarks`, invalidates the
benchmark cache, then compares the exact-run API metadata. Failure exits nonzero and
keeps the checkpoint in the receipt. Retry that phase without downloading or ingesting:

```sh
bun run admin:db:backfill-gpu-metrics --run RUN_ID --attempt ATTEMPT \
  --receipt /path/power-publication.json --refresh-cache-only --yes
```

The receipt's run/attempt, point IDs and endpoint must still match. If interruption
left planned audit writes unfinished, re-ingest the targeted artifact first.

## Verify the repair

Run the HTTP verifier against the app connected to the repaired database:

```sh
bun packages/db/src/verify-power-publication.ts /path/power-publication.json https://TARGET_ORIGIN
```

Inspect per-point receipt gaps, point and Timeline API responses, then reload or
refocus the browser. Check the expected hosts, GPU IDs, timestamps and digest values.
Telemetry revisions refresh point caches automatically; no manual PowerX cache purge
is needed. Benchmark audit changes require the refresh step above.

- `artifact_missing` or `expectationErrors`: recover the exact named telemetry or
  benchmark sibling. An unreadable benchmark sibling leaves the expected count unknown.
- `ingest_failed`: fix the recorded artifact or sidecar error and re-ingest it.
- `point_link_missing`: re-ingest the named artifact to restore the link.
- Keep unresolved `recoveryError` and `recoveryArtifactNames` visible until those
  artifacts are repaired. Readable old data does not prove a correction succeeded.

`apiReadablePoints` counts successful HTTP reads; `apiCompletePoints` also requires
complete retained inventories and links. `plannedPointCount: null` means the full sweep
is unknown. A successful ingest or receipt does not establish full sweep coverage or
measurement validity.

## Roll back

Restore only the snapshotted rows in a reviewed transaction, or re-ingest the original
bytes and sidecars with the same run/attempt/point identities. Verify counts, links and
API responses again. Do not delete a shared series to repair one point.

Revert application code only if needed, then use the existing cache invalidation
procedure because the previous code restores its old cache behavior.
