# PowerX persistence and repair

PowerX point detail, the run explorer and Power Timeline read migration-016 telemetry
from the database. Timeline applies the same prefix selection, validation-window cuts,
60-second padding and one-second per-device means as the artifact path. Stored samples
retain UTC timestamps, original units and separate host-local GPU identities. GitHub
remains the fallback for telemetry that has not been stored.

Timeline sends a read-only `POST /api/gpu-metrics?runId=RUN_ID&series=power&prefix=PREFIX`
with JSON `{ "sources": ["power_validation_RESULT_FILENAME.json"] }`. The planner sorts
and deduplicates validation basenames, and includes them in the React Query key. The body
accepts 1–1000 identities, each RESULT_FILENAME up to 200 ASCII letters/digits/`.`/`_`/`-`,
matching `prefix` when supplied; invalid input returns 400 and bodies above 256 KiB return 413. POST avoids putting a whole run's identity list in a URL. GET remains compatible with
the raw explorer and existing callers.

Only requested identities absent from healthy DB series trigger artifact discovery. Merging
prefers DB by validation identity, so a live sibling window in the same bundle is retained.
`sourceCoverage: { status, missingSources }` reports coverage of the requested identities:
`complete` or `incomplete` for POST, `unknown` for GET without an expectation list. It is
not a full-run/sweep or raw-sample completeness receipt. An unavailable GitHub token, listing
or download keeps healthy requested DB series readable with incomplete coverage; it cannot
hide known-incomplete stored telemetry or database failures. Unrelated stored artifacts
outside the requested identities do not block that read.

Live ordinary CSVs and bundle CSVs normalize NVIDIA wall-clock timestamps with adjacent
collector context using the ingest parser. Context must be in the same ZIP directory as
the CSV; host directories never share offsets. When multiple context candidates exist, both
ingest and live reads select the first valid object in code-unit filename order, independent
of archive or filesystem listing order. ISO/AMD timestamps and missing context
retain their existing behavior.

Both paths keep the first row for a device/timestamp, matching the existing ingest
deduplication, before averaging distinct samples within a bucket. A discovered unreadable
host CSV alongside readable CSVs fails telemetry preparation before any series is written;
it cannot disappear from the stored inventory and falsely establish complete coverage.

New ingests preserve validation documents, bundle manifests and expected file/sample
inventories in the existing series sidecars. Older ingests
can recover validation source/window from linked benchmark `power_audit` provenance.
Information never retained, such as historical validation role overrides, cannot be
reconstructed: recover the exact original artifact and re-ingest it. An incomplete
stored bundle must not silently become a smaller deployment's average. Incomplete stored
telemetry can use live CSV fallback only when every retained file and deduplicated sample
count is present. Missing/header-only host files, truncated data, and a second incomplete
artifact must not disappear behind another artifact's successful recovery. Complete stored
artifacts remain in a fallback response even if their GitHub artifacts have expired.
A known-incomplete power bundle needs re-ingest because the downloaded window cuts do not
prove its full original host/sample inventory. Un-ingested bundles still use normal artifact
fallback. Unverifiable recovery returns `503 STORED_TELEMETRY_INCOMPLETE` with the artifact
and a targeted re-ingest action. DB query failures return `503 DATABASE_UNAVAILABLE` and do
not attempt artifact fallback.

The live raw explorer also keeps each CSV as a separate series, matching the database
reader. Multi-file artifact labels include the CSV path, so host-local GPU 0 values cannot
be merged into one device. Single-file labels remain unchanged.

AgentX artifacts may retain their validation at
`LOGS/agentic/conc_N/power_validation.json`. Both stored and artifact readers recognize
this layout only when the exact root result filename, its `conc`, and the retained
`LOGS/power/windows/agentic_power_concurrency_N.json` agree with the validation's
selected window. Missing, malformed or mismatched evidence does not create a window.
The normalized source is `power_validation_<root-result-stem>.json`; it is an alias,
not an invented top-level file. Stored validation sidecars retain `validation_path`,
`result_file` and the SHA-256 of the original validation bytes. Legacy top-level
validation documents take precedence, and power-validity and role values stay unchanged.

Normal CI derives missing AgentX benchmark source/window metadata before publication
and benchmark upsert, retaining it across aggregate copies of the same full point
identity. Targeted telemetry re-ingest also fills SQL-NULL `power_audit` after all hosts
are stored and linked, including sample no-ops. It requires one unambiguous AgentX point
within the caller's explicit run/result IDs with matching concurrency; it neither
overwrites non-null provenance nor changes metrics, workers or validity. The ingest
result reports actual `metadataUpdatedBenchmarkResultIds`. Ordinary benchmark reads
also require the existing `latest_benchmarks` refresh and benchmark cache invalidation;
point/Timeline revision changes alone do not refresh the UI's benchmark source list.

## Cache and browser recovery

`/api/v1/gpu-metrics-point?id=N` checks a live database revision before reading its existing
Blob cache. The revision includes linked series, ingest time, CSV hash, sidecars and shared
point links/audits. The payload stays in Blob; the revision query reads only metadata.
Same-input ingest leaves the revision unchanged. A sidecar correction, series replacement,
new point link or linked audit correction selects a new cache entry, including for every
point sharing the series. Missing points are not negatively cached. A re-ingest that
commits while the reader is between its statements changes the series version key
(`csv_sha256`, `sample_count`, `ingested_at`), which the reader re-checks after loading
and retries, so a payload never mixes statistics and samples from two versions.

Point and Timeline responses use `Cache-Control: no-store`, so CDN/browser response caches
cannot skip the database check. Client queries revalidate on mount and window focus.
An already open page refreshes when revisited/refocused or reloaded; there is no continuous
polling. A failed Blob write logs `serving uncached result`, returns fresh DB data, and is
retried on the next read. A database failure remains an API error even if an old Blob exists.
Old cache generations remain until the existing prefix cleanup runs; repair does not require
a manual PowerX cache purge. General benchmark cache invalidation still follows normal CI.

## Coverage receipts

The existing `power-publication.json` gains an optional `telemetry` receipt, keyed by run,
attempt and stable benchmark-point identity. Its stages distinguish expected benchmark
attachments, produced artifacts, stored series/samples, point links and actual API readback.
Normal CI builds expectations from benchmark rows before telemetry discovery. Backfill
also inspects benchmark siblings whose telemetry artifact is absent. Unreadable benchmark
siblings are recorded in `expectationErrors`; known identities still proceed independently.

`plannedPointCount: null` explicitly means the full planned sweep is unknown. Attachment
coverage over available benchmark rows does **not** prove full sweep coverage. Point,
artifact, series and sample counts are separate: a bundle can contain multiple host series
and multiple points can share those series. Receipt entries list missing identities,
reasons, and exact run/attempt/artifact recovery targets. DB success leaves API status
`unknown`; only `verify-power-publication.ts` advances it after an actual HTTP read.
Telemetry failures remain isolated from benchmark publication failure policy.

The expectation boundary is the successfully mapped, non-purged benchmark rows
selected for ingestion, plus persisted benchmark identities recovered by the
receipt query. It is not every raw result or every planned job. Mapping/preflight
errors remain in the existing ingest diagnostics. Unreadable/unmappable benchmark
rows and failed config resolution make `expectedSource` unknown while retaining
known point identities; intentionally failed or purged benchmarks remain excluded.
The telemetry receipt does not
reconstruct the planned matrix, even when a separate required-power manifest is
available; `plannedPointCount` stays null. An unreadable backfill benchmark sibling
sets `expectationErrors` and makes `expectedPoints` unknown, including when its
telemetry pair exists.
Backfill preserves mapped points alongside per-row diagnostics for unmappable rows;
multiple row errors in one benchmark artifact count as one failed artifact. Every
mapped point in a correction must match a persisted benchmark before telemetry
ingest can clear that artifact's recovery failure. An uploaded correction with an
unmatched point is not a successful repair, even when older data remains readable.
Later refreshes retain unresolved expectation errors until that exact sibling's
identities can actually be recovered; an expired sibling cannot disappear from
the unknown denominator.
This also applies on the first receipt: a selected expired benchmark sibling records
an expectation error without attempting a download. Superseded retries and unrelated
targets remain excluded by the existing logical-name and artifact filters.

Historical backfill retains the resolver's exact-first, unique-fallback offload matching.
A proven fallback uses the persisted point's offload identity before receipt counting
and recovery checks, including benchmark siblings whose telemetry is absent. Repeating
the recovery removes only the corresponding old null-ID phantom in that artifact's
scope; real on/off points remain distinct. Conflicting artifact observations or prior
artifact scope stay visible with an unknown denominator rather than overwriting errors.

Normal CI deliberately retains successful artifacts from earlier attempts of the
same run/head for `rerun-failed`. Receipt `runAttempt` identifies the persisted
ingest cohort, not the collection attempt of every artifact. Per-artifact collection
attempt is unknown unless independently retained in source provenance. Do not
filter the normal artifact plan to the latest attempt and silently drop successful
points. Explicit `--download .../attempts/N` rejects a different current attempt;
targeted GitHub telemetry recovery uses its stricter current-attempt filter below.

An empty or wholly unreadable telemetry correction is an ingest failure, even when
older stored samples remain readable. A targeted recovery retains unresolved
`recoveryError` and `recoveryArtifactNames` from other artifacts. Sequential successful
repairs remove only their own artifact names. Older receipts with an unscoped recovery
error require a successful full-run refresh to clear that error; repairing a different
artifact cannot establish recovery. Retained error text describes the failed attempts;
the remaining artifact names identify the outstanding scope.

| Receipt reason       | Targeted action                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `artifact_missing`   | Recover the exact listed sibling from the same source provenance; use retained local bytes if GitHub no longer has that attempt. Do not substitute a newer attempt. |
| `ingest_failed`      | Inspect the recorded error, correct the exact artifact or sidecar, then re-ingest it. Empty/unparseable CSVs do not count as a successful correction.               |
| `point_link_missing` | Re-ingest the named unchanged artifact for the recorded run/attempt. Existing series/samples remain idempotent and the missing link is restored.                    |
| `expectationErrors`  | Recover the named benchmark sibling first so its point identities can be enumerated; successful telemetry downloads alone do not establish the denominator.         |

Apply the run/attempt/artifact selectors in each point's `recovery` object to the
commands below, merge the same receipt, then run the HTTP verifier. A missing explicit
target or deleted GitHub run reports failure. Neither a successful command nor the
benchmark-level `matched` status establishes telemetry completeness: inspect the
separate counts, unknowns and outstanding errors.

The stored inventory distinguishes `storage.status` complete/incomplete/unknown. Missing
host files and mismatched sample counts remain gaps even when the surviving payload can be
read. `apiReadablePoints` counts actual successful HTTP reads; `apiCompletePoints` additionally
requires the retained artifact inventory and every point link. Legacy rows without an inventory
remain unknown until recovered; they do not silently count as complete. A failed correction or
receipt recovery error also blocks the complete count, even when older data remains readable.

## Full-record statistics

The point detail, run explorer and public `/api/v1/views/gpu-metrics` projection use the
stored per-GPU digest for the existing full-record statistics, with name mappings only.
Units and percentile/stddev definitions are unchanged.
Zero is a value; missing metrics or an empty digest remain missing. Live, un-ingested
artifact data still computes statistics in the browser. These tables include startup and
warmup. They are not serving-window power, energy, or user-selected-window statistics.

For each file/host series and GPU, the population keeps the first row at each timestamp,
then excludes missing or nonfinite readings separately for each metric. Live CSV parsing
uses the same rule; a missing optional temperature or clock does not discard valid power.
Count is exact, mean is sample-weighted, P50/P95/P99 use linear interpolation at
`p * (N - 1)`, and standard deviation uses the population denominator `N`. Multi-host
GPU indices must remain in separate series. No time weighting, smoothing, chart zoom or
GPU visibility filter changes the full-record table. Window calculations still consume
the selected samples, and serving energy/financial metrics retain their own definitions.
SQL samples and digests use `real` (float32), so compare stored values with an explicit
float32 tolerance rather than the tighter tolerance of the in-memory parser tests.

## Local verification

From the repository root:

```sh
bun run --cwd packages/app test:unit src/app/api/v1/gpu-metrics-point/route.test.ts
bun run --cwd packages/app test:unit src/app/api/v1/views/gpu-metrics/route.test.ts
bun run --cwd packages/db test:unit src/queries/gpu-metrics-timeline.test.ts src/etl/telemetry-receipt.test.ts
bun run --cwd packages/app test:e2e:component --spec cypress/component/gpu-stats-table.cy.tsx
```

The focused browser driver creates a disposable localhost PostgreSQL database, ingests
NVIDIA/AMD/multinode artifacts, starts Next without a GitHub token, and enables the real
Blob SDK against a local HTTP fixture. It writes logs, screenshots and receipts, then stops
its owned processes. It uses ports 3137/3138 and requires PostgreSQL 17 tools. Run with a
fresh output directory while no other dev server is using this checkout's `.next` directory:

```sh
cd packages/app
POWERX_PG_BIN=/path/to/postgresql/bin bun scripts/powerx-db-acceptance.ts /absolute/fresh/output
```

The ordinary fixture-backed smoke command remains `bun run test:e2e` with an
`E2E_FIXTURES=1` dev server. The full cross-browser matrix remains the repository CI gate.

## Deployment and targeted data repair (operator review required)

1. Deploy the reviewed application and ingest/backfill code together. Verify migrations
   `015_power_provenance.sql` and `016_gpu_metrics.sql` already exist on the target. This
   change adds no migration. Do not run migrations or backfill against production merely
   to inspect a receipt.
2. Retain the original publication receipt, exact artifact bytes, sidecars, source run and
   attempt. Snapshot the target run's telemetry series, samples, digests and point links
   before correction. Check that the app reads the same database that ingest writes.
3. Inspect a bounded candidate with the existing command, using explicitly selected
   target credentials in the operator environment:

   ```sh
   bun run admin:db:backfill-gpu-metrics --run RUN_ID --attempt ATTEMPT --dry-run
   ```

4. Once authorized, repair only the named artifact and merge the existing receipt:

   ```sh
   bun run admin:db:backfill-gpu-metrics --run RUN_ID --attempt ATTEMPT \
     --artifact EXACT_ARTIFACT_NAME --receipt /path/power-publication.json --yes
   bun packages/db/src/verify-power-publication.ts /path/power-publication.json https://TARGET_ORIGIN
   ```

   Before a backfill that may fill missing AgentX `power_audit`, set
   `CACHE_INVALIDATE_URL=https://TARGET_ORIGIN/api/v1/invalidate` and
   `CACHE_INVALIDATE_SECRET` (or `INVALIDATE_SECRET`); protected previews also need
   `CACHE_PROTECTION_BYPASS_SECRET`. The selected app must use the same DB and its
   existing cache namespace/Blob prefix. No new cache scope is introduced.

   The backfill checkpoints NULL-audit AgentX candidates in the existing manifest
   before ingest writes. `benchmarkRefresh` records IDs, retained source-derived
   audit updates, target endpoint, pending/complete/failed status, check time and
   error. DB audits must match that saved source evidence. Only the matching
   publication points' NULL audit fields are enriched; original artifact hashes,
   benchmark values and unrelated points remain unchanged. Without `--receipt`, the
   existing default is `power-publication-RUN_ID-attempt-ATTEMPT.json`. Missing
   configuration fails that pair before ingest; configuration errors cannot
   silently turn a metadata write into a successful backfill.

   After ingest, refresh runs in this order: `latest_benchmarks` materialized view,
   the existing invalidate endpoint, then exact-run benchmark API comparison by ID
   and structured `power_audit`. Refresh failure exits nonzero and retains the
   responsibility even if the next ingest changes no samples or metadata.
   To retry only that phase, without downloading artifacts or rewriting samples:

   ```sh
   bun run admin:db:backfill-gpu-metrics --run RUN_ID --attempt ATTEMPT \
     --receipt /path/power-publication.json --refresh-cache-only --yes
   ```

   The receipt's run/attempt, point IDs and endpoint must still match. A checkpoint
   interrupted before its metadata UPDATE leaves NULL candidates. They retain a
   failed refresh responsibility and require targeted artifact re-ingest; a later
   upsert clearing an already-written audit cannot erase that responsibility.
   Invalid/string-encoded audits fail explicitly. HTTP calls have a 30-second
   timeout; retries use the saved receipt rather than an unrecorded manual purge.
   Dry runs never refresh. `complete` covers the recorded IDs and API metadata,
   not browser state, energy validity or deployment-wide acceptance.

   An explicit `--run` is rechecked even if some series already exist. Unchanged inputs
   are no-ops. The GitHub backfill route accepts only the current source attempt and
   filters out earlier attempt artifacts; it refuses a mismatched historical attempt.
   Expired or older-attempt bytes require retained artifacts through the existing local
   ingest path (`INGEST_ARTIFACTS_PATH` and exact source-run metadata), after operator
   review. Never substitute another attempt's bytes. A local sidecar correction must be
   applied to the retained artifact tree; re-downloading unchanged GitHub bytes cannot fix it.
   The local ingest entry takes `INGEST_RUN_ID`, `INGEST_RUN_ATTEMPT`,
   `INGEST_REPO=SemiAnalysisAI/InferenceX`, `INGEST_ARTIFACTS_PATH` and
   `POWER_PUBLICATION_MANIFEST`, then `bun run admin:db:ingest:ci`. It also requires
   `GITHUB_TOKEN` and the reviewed `DATABASE_WRITE_URL`. Inspect any retained
   `reused-ingest-metadata/reuse_source_run.json` first: it overrides run/attempt identity.

5. Inspect per-point receipt gaps and both point/Timeline APIs, then refocus/reload the
   browser. Check expected hosts, GPU IDs, timestamps and digest values. Ingest success
   alone is insufficient. No telemetry cache purge is required.

For rollback, revert application code only if needed; additive sidecars/receipt fields are
compatible with the previous schema. Reverting application code restores its old cache
behavior, so the existing cache invalidation procedure is required in that case. To undo
a data correction, re-ingest the retained original bytes/sidecars against the exact same
run/attempt/point identities, or restore only the snapshotted rows in a reviewed transaction.
Verify links and counts again. Do not delete a shared series to repair one point.

Local tests do not establish deployment, production repair, expired-artifact recoverability,
or complete published PowerX coverage.
