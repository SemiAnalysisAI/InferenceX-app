# PowerX persistence and recovery

Use this runbook to deploy PowerX storage, recover missing telemetry, or undo a data
correction. Run commands from the repository root with credentials for the intended
target. The application and ingest process must use the same database.

## Deploy

Check the target migration ledger and apply pending migrations before running writers:

```sh
bun run admin:db:migrate --yes
```

PowerX requires `016_gpu_metrics.sql`. CI ingest workflows migrate
automatically; manual backfill does not. Migrate before deploying an app build that
reads these tables; until 016 exists, its telemetry reads fail.

## Repair a run

Retain the original receipt, artifact bytes and sidecars with their exact source run
and attempt. Before correction, snapshot the affected series, samples, point
links and any benchmark audits the repair may update. Set `DATABASE_WRITE_URL` and
`GITHUB_TOKEN` for the intended target, then preview the named artifact:

```sh
bun run admin:db:backfill-gpu-metrics --run RUN_ID --attempt ATTEMPT \
  --artifact EXACT_ARTIFACT_NAME --dry-run
```

Repair the artifact and merge the existing receipt:

```sh
bun run admin:db:backfill-gpu-metrics --run RUN_ID --attempt ATTEMPT \
  --artifact EXACT_ARTIFACT_NAME --receipt /path/power-publication.json --yes
```

The backfill writes a receipt only with `--receipt`, which requires `--run`; a missing
file starts a new receipt. Root scripts run in `packages/db`, so give receipt paths as
absolute paths. When the repair fills a missing AgentX `power_audit`, the merged
receipt's point expects the recovered value. After an interruption, rerun the same
command.

Unchanged inputs are no-ops; after a parser fix, add `--force` to replace the stored
samples. GitHub backfill accepts only the current source attempt.
Older or expired artifacts require retained original bytes; never substitute another
attempt's artifacts. For local recovery, set `INGEST_RUN_ID`, `INGEST_RUN_ATTEMPT`,
`INGEST_REPO=SemiAnalysisAI/InferenceX`, `INGEST_ARTIFACTS_PATH` and
`POWER_PUBLICATION_MANIFEST` (the receipt path; without it no receipt is written), then
run `bun run admin:db:ingest:ci` with the same credentials. Inspect
`reused-ingest-metadata/reuse_source_run.json` first if present; it overrides the
run/attempt identity. Apply sidecar corrections to the retained tree.

Both commands refresh `latest_benchmarks`. Then refresh the API cache of the app that
reads the repaired database, with that app's `INVALIDATE_SECRET` set:

```sh
bun run admin:cache:invalidate https://TARGET_ORIGIN
bun run admin:cache:warmup https://TARGET_ORIGIN
```

These scripts send no Vercel protection bypass header. Invalidate a protected preview
the way `.github/workflows/ingest-results.yml` does.

## Verify the repair

Run the HTTP verifier against the app connected to the repaired database. For a
protected preview, set `CACHE_PROTECTION_BYPASS_SECRET`:

```sh
bun packages/db/src/verify-power-publication.ts /path/power-publication.json https://TARGET_ORIGIN
```

Inspect per-point receipt gaps and point API responses. Check the expected hosts, GPU
IDs, timestamps and statistics. Telemetry revisions refresh point caches
automatically; no manual PowerX cache purge is needed. Benchmark audit changes require
the cache refresh above.

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

After reverting application code, refresh the API cache as above.
