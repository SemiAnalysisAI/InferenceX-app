# Data Pipeline Design

## DB Schema Decisions

### Why Metrics Stay in JSONB

Benchmark measurements live only in the `benchmark_results.metrics` JSONB column;
there are no duplicated metric-specific columns on `benchmark_results` or
`latest_benchmarks`.

- **Schema flexibility**: CI can add metrics without a database migration, and
  historical rows simply omit keys that their artifact did not produce.
- **Read contract**: Raw benchmark endpoints pass the JSONB object through.
  Specialized readers such as MCP select keys explicitly. A missing historical
  metric remains absent until a presentation consumer applies its own fallback.
- **Indexes**: The benchmark indexes cover relational selection dimensions such
  as config, scenario, concurrency, sequence lengths, date, offload mode, and
  recipe fingerprint. Metric ranking and extraction use JSONB expressions rather
  than nonexistent "hot" columns.

### Why Denormalized Dates

`benchmark_results.date`, `workflow_runs.date`, and the `availability` table all store denormalized date values (derived from `workflow_runs.created_at`). This avoids JOINs in the hottest queries:

- `getLatestBenchmarks` orders candidate line snapshots by `date`, `run_started_at`,
  and workflow-run ID before applying the append-only curve rules. The stored curve
  lines (below) carry `date` from the benchmark rows.
- `availability` is a separate denormalized table because the date-picker query (`SELECT DISTINCT model, date`) needs to be fast without scanning benchmark_results.

### Maintained Latest State (`latest_benchmarks`, migration 028)

Computing the newest logical curve from the full result table is expensive, so it is
kept up to date as results are written. The newest logical curve snapshot includes
append-only history when applicable. An append-only run extends the run before it
when every line both contain keeps its image; an AgentX curve spans AGG/disagg and
offload lines that may run different images, matching InferenceX's append-only check. Point
identity within that snapshot remains config, scenario, sequence, offload mode,
recipe fingerprint, and concurrency. API routes use it when no date filter is
specified. Date-filtered, run and history requests apply the same rules to the
stored curve lines at read time.

`latest_benchmark_points` holds the selected point ids with their snapshot identity,
one curve scope at a time, and `latest_benchmarks` is a view joining them to
`benchmark_results`, so it keeps every result column and shows metric backfills at
once. `published_availability` holds the availability rows that a successful result
of a concluded latest attempt supports, and `published_availability_dates` holds them
as one JSON fragment per date, so `/api/v1/availability` reads a few hundred short
rows instead of joining every result. Its rows are ordered by date, model, hardware,
framework, precision, benchmark type, ISL, OSL, spec method and disagg.

Statement triggers queue what a write can change: the curve scopes of the stored
curve lines it rebuilds or of results whose concurrency or recipe changes, and the
(model, ISL, OSL, benchmark type, date) keys of lines and availability rows it
touches. Changes to a run's attempt, start time, `append_only` or conclusion queue
every line of the GitHub run. A deferred trigger recomputes the queued scopes and
keys once per transaction at commit, under one advisory lock, so concurrent writers
publish one after another and each sees the others' committed rows. There is no
refresh step: every writer, manual SQL included, leaves both exact when it commits.
A run ingest publishes in about 20 ms of database time where
`REFRESH MATERIALIZED VIEW CONCURRENTLY` took about half a second.

To check the maintained points against a full recompute, compare
`latest_benchmark_points` before and after
`select refresh_latest_benchmark_points(array(select distinct curve_scope from benchmark_curve_run_lines))`
inside a transaction that you roll back.

### Maintained Presence (`benchmark_presence_runs`, migration 029)

`/api/v1/benchmark-presence` lists which results have a stored trace (a linked
`agentic_trace_replay` row with an inline or chunked profile) and which have a linked
server log, as runs of consecutive result ids. `benchmark_presence_runs` holds those
runs, one row per (`trace`, `start`) with its `length`, so a read touches about 1.1k
short rows and returns each list as one string of gaps and lengths.

Statement triggers on `benchmark_results` queue the ids whose `trace_replay_id` or
`server_log_id` a write sets, changes or removes. Row triggers on
`agentic_trace_replay` queue the results that link a replay row whose profile appears
or disappears or whose id moves. A truncate of `benchmark_results` clears the runs.
At commit, a deferred trigger on `published_benchmark_pending` takes its own advisory
lock, deletes every run that contains or borders a queued id, and rebuilds the runs
of those runs' ids and the queued ids from the source rows, by primary key. A run
ingest refreshes in a few ms of database time. Queuing every result id rebuilds all
runs in about 0.6 s.

To check the runs against a full recompute, compare `benchmark_presence_runs` with
the islands of present ids (`id - row_number() over (partition by trace order by id)`)
or insert every result id into `benchmark_presence_dirty_ids` and call
`select refresh_benchmark_presence()` inside a transaction that you roll back.

### Stored Curve Lines (`benchmark_curve_run_lines`, migration 023)

Every curve read starts from one row per workflow run, date and curve scope: its
images, the image of each AGG/disagg and offload line (`line_images`), and the ids of
the run's successful points in that scope (`point_ids`). Migration 023 stores these
rows. Readers join them to `latest_workflow_runs`, so attempts, start times and
`append_only` stay live. Statement-level triggers on `benchmark_results` (insert,
update, delete, truncate) and `configs` (update) rebuild the rows of each run a
statement touches, so every writer keeps them exact, manual SQL included. Updates
that leave the line inputs unchanged (metrics, power audits, links) rebuild nothing.
Readers rank a model's lines instead of aggregating every one of its result rows,
then join the selected point ids to `benchmark_results` by primary key. The maintained
latest state reads the same rows. `benchmark_curve_runs` keeps its
migration 014 columns over the stored lines. Results break ORDER BY ties by point
identity, so their bytes do not depend on the query plan.

Apply migration 023 before deploying readers that use it, as with 016. To check the
stored rows against the results, compare `benchmark_curve_run_lines` before and after
`select refresh_benchmark_curve_run_lines(array(select id from workflow_runs))`,
which rebuilds every run.

### Why Idempotent Ingestion

Every INSERT uses `ON CONFLICT DO UPDATE` or `DO NOTHING`. This means:

- **Re-running ingest is safe**: Same CI run ingested twice produces identical results.
- **Partial failures recover**: If ingest crashes mid-batch, re-running picks up where it left off.
- **No cleanup needed**: No "delete old data first" step that could leave the DB empty on failure.

The unique constraints match natural keys (for benchmarks, workflow/config/scenario,
concurrency, offload mode, and the nullable recipe fingerprint), not surrogate keys.

### Results Published Outside CI

The database is the source of truth for every result. Results measured outside our CI
(OpenAI's Jalapeño points and CoreWeave's July Vera Rubin NVL72 curve) exist only there, each
snapshot as its own `workflow_runs` row with a fixed negative `github_run_id` (-1 to -3), so
snapshots never share a run and the benchmark natural key cannot fold one snapshot's points into
another's. Results from our own runs, including private-repo runs such as the TPU7x sweeps, are
ingested from their GitHub run. A snapshot's `html_url` is its source page, and the benchmark
queries return it as `run_url` without the GitHub `/attempts/N` suffix. A source that publishes
only output throughput omits `tput_per_gpu`, and the dashboard then offers only output-token
metrics for those points.

### AgentX Curve Replacement Scope

For `agentic_traces`, a curve is identified by model, hardware, framework, precision,
and workload (benchmark type and sequence lengths). AGG/disagg, parallelism,
speculative decoding, offload mode, and recipe fingerprint describe individual
points within that curve; they do not start independently replaceable curves.
A new normal sweep owns the complete curve, including which variants are absent.
If one sweep contains both AGG and disagg points, both remain visible.
Fixed-sequence workloads retain their existing separate spec-method, disagg, and
offload scopes. Models, hardware, frameworks and precisions always stay separate.

The client uses the same replacement scope when selecting official runs. An
unofficial overlay remains a separate comparison; it does not replace official data.

Eligible rows are the successful benchmark rows from the latest stored run
attempt. Overall workflow status is not a completeness signal: accepted benchmarks
can come from workflows whose later upload or evaluation failed. Detecting an
incomplete sweep requires an explicit producer completion manifest and publication
contract; the app does not infer completion from a missing config or workflow
conclusion. A normal partial sweep still replaces its curve, so intentional deltas
must use the append-only contract below.

### Required Power

InferenceX enforces required power per benchmark job: a matrix row with
`require-power: true` runs with `REQUIRE_POWER=1`, and an invalid measurement window
fails that job. Without the flag the row records `power_valid=0`. Ingest has no
separate required-power gate; it publishes the rows the sweep uploaded.

### Retried Attempts

GitHub keeps artifacts from every attempt, so a point that passed on several attempts
arrives as several job copies with unrelated hashed names. Preparation keeps the copy
whose benchmark artifact is newest, which is the latest attempt that produced the
point, and removes every sibling artifact of older copies (power audit, telemetry,
traces, server logs). Ingest skips `results_*` aggregate rows for points that a
per-job file already holds, and replaces a point's telemetry links instead of adding
to them, so the row, its power series and the publication receipt share one copy.

The publication receipt verifies DB and exact-run API values after ingest; it does
not prove latest-curve visibility or browser rendering.

### Append-Only Curve Extensions

Normal workflow runs are complete line snapshots: the latest run for a line replaces
the prior run as a unit, so partial re-sweeps cannot silently stitch points from
different recipes. A changelog containing only `append-only: true` entries marks the
one narrow exception. The latest-curve queries then walk backward through consecutive
append-only runs and include the nearest full snapshot, selecting the newest producer
for each recipe and concurrency. The producer stamps every new point with a deterministic
`recipe_fingerprint`, so variants that share the app's normalized topology and concurrency
remain separate. Historical rows have a null fingerprint and retain their legacy identity.

The chain continues only while the image is identical. Each returned benchmark row
keeps its original workflow-run ID and run URL, so extending a curve does not erase
point provenance; `curve_date` and `curve_workflow_run_id` carry the separate logical
snapshot identity used by charts and history. InferenceX CI separately verifies that
the generated matrix is strictly additive: existing recipes and points are immutable,
while newly added concurrency points or complete recipe variants may run as deltas.
All appended points must retain their AGG/disagg and offload line's image, and benchmark-affecting code
changes must be isolated to the new points.

`/api/unofficial-run` previews an append-only run the same way. For each curve the run
touches, it adds the current published points from `latest_benchmarks`, walking their
producer runs newest first while every shared line keeps its image. A point the run re-measures replaces the published one.
Inherited rows keep their producer date, workflow-run ID and result ID. They take the
unofficial run's URL because overlays group series by run URL. Every row in the stitched
curve gets the run's date as `curve_date` and the negated GitHub run ID as
`curve_workflow_run_id`, since the run has no `workflow_runs` row yet.

### Audited Point Purges

`packages/db/src/etl/run-overrides.ts` is the durable audit record for exceptional
data removal. Use `PURGED_BENCHMARK_POINTS` when a valid workflow run contains a
specific invalid result, such as a server hang. Each record names `githubRunId`,
`runAttempt`, `configId`, `benchmarkType`, `isl`, `osl`, `conc`, `offloadMode`, and
the optional nullable `recipeFingerprint`, with a dated reason comment. A fingerprint
targets exactly that recipe; omitting it or setting it to null targets only legacy rows
whose stored fingerprint is null. The full identity is required because one run can
contain multiple serving configurations and recipes at the same sequence lengths and
concurrency.

`bun run admin:db:apply-overrides` previews every matching row and requires confirmation
before deleting it in a transaction. It also removes unreferenced server logs and
trace-replay sidecars and clears availability entries that no remaining successful row
supports. The override remains in source control,
so future CI and GCS ingests skip the point instead of restoring it.

CI ingests match the run attempt exactly. If a GCS backup cannot retrieve GitHub run
metadata, it matches the same run and full point identity across attempts. This
conservative fallback prevents a failed GitHub lookup from restoring a suppressed
point. It can only suppress an identical point from another attempt while that
attempt remains unknown.

### Audited Run Backfills

Exceptional metadata corrections use the same reviewed, automatically enforced ledger
as purges. Add a `CHANGELOG_BACKFILLS` or `BENCHMARK_POINT_BACKFILLS` entry in
`packages/db/src/etl/run-overrides.ts`; never add a one-off production SQL statement.
Every entry has a stable kebab-case `id`, a human-readable `reason`, an exact run attempt,
and the target table's complete natural-key selector. The source-control history records
who approved the correction and why, while the stable ID appears in ingest and apply logs.

Changelog backfills select `(githubRunId, runAttempt, baseRef, headRef)` and can patch
`configKeys`, `description`, `prLink`, or `appendOnly`. An `appendOnly` correction updates
both `changelog_entries.append_only` and `workflow_runs.append_only` atomically because
the materialized benchmark view reads the run-level value.

Benchmark point backfills use the same complete point selector as audited point purges:
`githubRunId`, `runAttempt`, `configId`, `benchmarkType`, `isl`, `osl`, `conc`,
`offloadMode`, and nullable `recipeFingerprint`. Their `set` block supports a shallow
`metricsMerge`, top-level `metricsRemove`, and `offloadMode`. Setting `offloadMode`
updates both the first-class column and `metrics.offload_mode`; for example, a missed CPU
KV offload annotation can set `offloadMode: 'on'` and merge `kv_offloading` plus backend
metadata in one correction. Unrelated metrics remain unchanged. Setting `specMethod`
moves the point to the config that differs only in its speculative decoding method and
adds that method's availability row, dropping the old method's row once no point uses
it. `SPEC_METHOD_BACKFILLS` (`spec-method-backfills.ts`) uses it for AgentX points the
matrix labeled `mtp` whose server never drafted.

When extending an already-applied identity-changing correction, record its old
`set` as `previousSet`. The recovery command accepts that declared prior patch
before applying the new fields; unrecognized destination states still fail closed.

Post-ingest workflows scope recovery to the ingested run with `--run-id` and
`--allow-unregistered-run` (a no-op for runs without corrections). They do not
reapply unrelated historical corrections that may be absent from a staging branch.
The standalone recovery command remains strict by default.

Run `bun run admin:db:apply-overrides` to preview the exact rows, reasons, and patches;
the command requires confirmation unless passed `--yes`. It fails before writing when a
target is missing, when a point's desired identity already exists, or when registry
validation finds an overlap or duplicate. Writes are verified against the declared state.
Merges to `master` run the same command in
CI, followed by database verification, cache invalidation, and cache warmup.

Point corrections are additionally applied before each CI or GCS benchmark insert. This
prevents a later idempotent re-ingest from restoring the artifact's original value. The
ingest tracks source and desired identities across the run and fails on a collision instead
of silently collapsing two distinct artifact points. When GCS cannot recover an attempt
number, it follows the purge path's conservative fallback and matches the exact run and
point across attempts; the log records the applied backfill ID. Changelog corrections are
likewise applied to artifact metadata before `appendOnly`/`evalsOnly` run semantics are
resolved and before the changelog is upserted.

### Audited Framework Reassignments

A sweep can serve one framework while its matrix entry declares another. The Qwen3.5
TPU v7 AgentX xPyD run 40744397059 ran every engine behind the llm-d router but was
declared as `vllm`, so its points were grouped with plain vLLM instead of `llmd-vllm`
like the GB200 llm-d sweeps. Register such a run in `RUN_FRAMEWORK_OVERRIDES` in
`packages/db/src/etl/run-framework-overrides.ts` (re-exported by `run-overrides.ts`; it
is a separate dependency-free module because the mappers, which the app bundles for the
unofficial-run route, read it at mapping time) with a stable `id`, a `reason`, the `githubRunId`,
the canonical declared framework (`from`), and the canonical served framework (`to`,
which must be a registered `FW_REGISTRY` key). Validation rejects aliases, unregistered
targets, duplicate selectors, and purged runs.

The benchmark and eval mappers substitute `to` for `from` before any config is
resolved, so every ingest path (CI, GCS backup, re-ingest) stores benchmark rows, eval
rows, and availability under the served framework, and changelog config keys are
rewritten (`qwen3.5-fp8-tpuv7-vllm-agentic-xpyd-mtp` becomes
`qwen3.5-fp8-tpuv7-llmd-vllm-agentic-xpyd-mtp`) so the changelog keeps matching the
corrected series. Point purges and backfills for the same run must therefore name the
served framework in their selectors.

`bun run admin:db:apply-overrides` moves rows an earlier ingest stored under `from`:
for each affected config it upserts the config that differs only in framework, repoints
the run's benchmark and eval rows in one transaction, inserts the served-framework
availability rows, deletes declared-framework availability rows that no remaining
successful row supports, rewrites the run's changelog config keys, and refreshes
`latest_benchmarks`. Unique constraints make a collision with an existing destination
row fail the transaction rather than merging two points. The orphaned source configs
are left in place; they are harmless and a future ingest of the same run resolves
straight to the served-framework config.

### Syncing Public Runs Into a Downstream Database

A downstream deployment's database does not receive public CI ingests. `bun run
admin:db:sync-public` reads `PUBLIC_DATABASE_READONLY_URL` and inserts the public workflow runs
the target (`DATABASE_WRITE_URL`) lacks, plus the missing child rows of runs it holds only
partially: benchmark results with their server logs, log files, and trace replays; eval results
and samples; run stats; changelog entries; run datasets; configs; datasets; and availability.

- Rows match on natural keys because serial ids differ between the databases.
- The sync is insert-only. It never reads back or modifies target-only runs, and every query
  against the source is a `SELECT`.
- Each run commits in its own transaction, so a rerun resumes after an interruption.
- Source columns from public migrations the target has not applied are skipped and reported.
- Existing target rows are not refreshed, so later public backfills, purges, and corrections of
  already-synced rows do not propagate. The sync lists drifted runs (the target holds more
  benchmark or eval rows than public) for manual reconciliation.
- Binary payloads are sized with `octet_length` on the raw value and copied in 4 MiB slices, so
  values near 1 GB never reach Postgres's 1 GB allocation limit.

`--run-id <id>[#<attempt>][,…]` restricts the sync to those runs; without an attempt every
attempt of the run is copied. An id the public database lacks fails the command, and a run the
target already holds in full is reported and skipped. In this mode the global `availability`
table is not copied, because it could advertise dates whose runs were not synced. Instead the
sync inserts the availability rows implied by the selected runs' benchmark rows, exactly as
ingest does. `--dry-run` lists the plan, `--limit <n>` caps the number of runs, and
`--max-value-bytes <n>` skips individual log and blob values above `n` bytes for a target
compute that cannot hold them; a later uncapped run fills what was skipped.

The `Sync Runs From Public Database` workflow (`sync-run-from-public-db.yml`) runs the sync for
the dispatched `run-ids`, migrates the target first, then invalidates and warms `APP_URL`. It
does not run in `SemiAnalysisAI/InferenceX-app`, whose database is the source.

### Connection drivers and policy

| Connection                      | Library                  | Use case                             |
| ------------------------------- | ------------------------ | ------------------------------------ |
| `@neondatabase/serverless` HTTP | Application API reads    | Stateless serverless queries         |
| `postgres` TCP                  | ETL, migrations, and MCP | Bulk work, transactions, and MCP SQL |

`resolveDatabaseConnection` in `packages/db/src/connection.ts` is the single URL and TLS
policy. Each caller selects its environment variable and driver deliberately. An explicit
URL can override the environment value, `DATABASE_SSL` can override host detection, and
loopback hosts disable TLS by default. Application reads may select Neon HTTP, while admin
and MCP clients remain on postgres.js.

Normal API reads use `DATABASE_READONLY_URL` so a replica can isolate read traffic from
writes. ETL uses the primary writer in `DATABASE_WRITE_URL`.

### Why CHECK Constraints for Lowercase

All text keys (model, hardware, framework, precision) have `CHECK (field = lower(field))`. This prevents case-sensitivity bugs where `H100` and `h100` create duplicate configs. The constraint is enforced at the DB level, not the application level, because multiple ingest paths (CI action, GCS backfill, manual scripts) all write to the same tables.

### Append-Only Migrations

Never rewrite an applied migration; add a new numbered file. `runMigrations` (`packages/db/src/lib/migration-runner.ts`) keys `schema_migrations` on the filename only, so an edited file is skipped on every database that already ran it.

## ETL Design

### Config Cache

Configs are preloaded into an in-memory Map at ingest start. `getOrCreateConfig()` checks the cache first, hits DB only for genuinely new configs. This avoids N+1 queries — without the cache, each benchmark row would need a separate config lookup.

### Skip Tracking

Unmapped models/hardware are tracked (not silently dropped) so operators can see what new GPU or model names appeared in CI artifacts. This is how new GPUs get added to the system — the skip tracker acts as a change detection mechanism.

### Server-Metric Orchestrator Adapters

AIPerf defines the `server_metrics_export.json` envelope, but labels such as worker role and rank belong to the serving orchestrator. The chart-series ETL therefore normalizes raw series through an orchestrator-specific adapter before exposing per-worker metrics. For example, the Dynamo adapter maps `dynamo_component=prefill|backend` to canonical `prefill|decode` roles and uses the endpoint, worker ID, DP rank, and engine together as the source identity.

Adapters are selected from the benchmark's canonical framework, and per-worker series are only emitted for disaggregated configs with a recognized adapter. Unknown orchestrators and non-disaggregated configs retain their aggregate-only series; roles are never guessed from ports or metric names. The frontend only consumes the canonical source identity and never interprets orchestrator-native labels.

Dynamo/TRT-LLM KV charts prefer `dynamo_component_gpu_cache_usage_percent`, which
retains `dp_rank`, over the rankless native `trtllm_kv_cache_utilization` gauge.
Ranks remain inside each worker's source; native-only endpoints retain their fallback.
The all-endpoints view summarizes workers, while selecting a worker exposes its ranks.

For runs ingested before a server-metric adapter was available, dispatch
`Recompute Agentic Metrics` on the default branch (`master`) with the benchmark run ID.
It force-rebuilds chart series and aggregate statistics from stored blobs for that run
in the `DATABASE_WRITE_URL` database, then invalidates the app cache. It does not rerun benchmarks or replace raw artifacts.

### Logical Engines vs Raw Series

A raw series in the blob is one `(scrape endpoint × phase block × label set)` tuple, which is **not** the same as one engine. The KV-cache chart needs one entry per _logical engine_ — one KV pool — so `compute-chart-series.ts` groups series by their Prometheus label set (`seriesIdentityKey`) rather than emitting one entry per raw series. Three kinds of duplication collapse there:

- **Phase blocks.** The warmup and profiling blocks each carry their own series for the same engine, so keying by scrape instant unions them into one continuous line. The two blocks' first/last bounds can look overlapping — the profiling series often emits a single boundary sample and then gaps until warmup ends — but they never share a scrape instant, so the union neither drops nor double-counts a sample.
- **Mirrored API-server frontends.** vLLM run with several API servers exposes the _same_ engine set on every `/metrics` endpoint, a few hundred ms apart. Identity ignores `endpoint_url` (Prometheus treats the label set as the series), and the endpoint covering the most wall-clock wins — merging the mirrors instead would interleave near-duplicate samples and halve the effective span of the frontend's fixed-width rolling average. Endpoints are only fused when their values actually agree; same-label endpoints whose readings diverge are independent replicas behind a router, and are kept as separate engines so none is silently discarded.
- **Intra-engine shard ranks.** `tp_rank` / `pp_rank` / `ep_rank` / `moe_ep_rank` shard one pool and all report the same utilization, so they are excluded from the identity and averaged. `engine` / `engine_idx` / `dp_rank` are _not_ excluded — those do name distinct pools.

The cluster average is then a mean across those logical engines on the union of their scrape instants, with each engine holding its last sample until its next one and contributing only inside its own observed window (and only while that sample is fresher than 5× the engine's own median scrape gap, so a reporting hole drops the engine out of the mean rather than pinning it to a stale reading). Grouping on an exact `start_ns` instead would average whichever engines happened to share that nanosecond — on a disaggregated run that alternates between "prefill only" and "decode only" and reads as a full-scale sawtooth.

Engines are ordered by role, then numeric rank, then worker — never by the composed display string, which would sort `"decode 10"` before `"decode 2"` and scramble DP ranks. The role is only shown when engines actually differ in role, so an aggregated deployment reads `DP 0…DP 3` rather than `decode 0…decode 3`.

### ATOM Server Metrics

ATOM exports aggregate `atom:` gauges and counters. KV usage and request queues
map directly to the existing charts; token throughput uses its completed-request
counters. Prefix-cache hit rates and token-source breakdowns use admitted cached
tokens and `prefix_cache_full_tokens`, not compressed-index matches,
checkpoint-eligible tokens, or completion-time prompt counts. The exporter does
not provide per-rank KV usage or CPU-pool utilization, so those remain absent.

ATOM's nominal KV token capacity is `allocated blocks × resolved block_size × DCP`.
Startup `Concurrent capacity vs context length` lines supply the resolved block size
and DCP width. Use `atom:kv_cache_blocks_total` for the allocated count: startup
`pool_blocks` estimates differ between TP workers, while the metric reflects the
selected pool and already sums independent DP pools. Do not sum worker estimates
or multiply by TP. Checkpoints may share this nominal pool with token KV storage.
Missing or inconsistent capacity metadata stays unset rather than guessed.

Ingestion derives `metrics.kv_cache_pool_tokens` when it links the trace artifact.
The startup lines are pulled from `server_logs.server_log` in bounded 64 MiB character
chunks (with a small overlap) because PostgreSQL's regex engine needs 4 bytes per
character and rejects a single allocation over 1 GiB; LMCache runs store 290–690 MiB logs.
The `db:backfill-atom-kv-capacity --run-id <id> --yes` command applies the same logic
to stored artifacts. The workflow's `atom-kv-capacity-only` option skips chart and
aggregate recomputation; no benchmark rerun or raw-artifact replacement is needed.

The Recompute Agentic Metrics workflow accepts an optional `neon-branch` to
rebuild a stored run in an existing child database. It verifies the child and
connection endpoint before writing; writing `DATABASE_WRITE_URL` still requires the
default branch. Preview environments use branch-scoped database and cache settings.
After a child-database repair, refresh its isolated `CACHE_NAMESPACE` and
`BLOB_CACHE_PREFIX` and redeploy that preview to retire cached payloads.

Use `run-id: all` for a stale-only repair across historical and current AgentX
points. Eight independent shards recompute charts, aggregates, and request
timelines using the checked-out code's versions. Each shard records database-side
fingerprints before writing and verifies that benchmark rows, raw artifacts, and
already-current timelines are unchanged afterward. Previously populated metrics
cannot be replaced with empty output; parsing failures fail the job and preserve
the old payload. Integrity manifests are retained as workflow artifacts.

Relevant backfill/parser changes merged to `master` run this stale-only repair
against production and invalidate the cache only after every shard passes.
Test on a snapshot branch first, then staging using the preview's parser version.
Production must use its own deployed parser version, not an unmerged preview's.
Runs without original metrics or trace artifacts are reported separately: a
version upgrade cannot reconstruct data that was never captured. To deliberately
rebuild an already-current run, set `stale-only: false` with its numeric run ID.

### Summed Series and the Canonical Grid

The same "components aren't scraped in lockstep" problem hits the **summed** series — prefill/decode/prefix-hit rates, queue depth, host KV usage, and the prompt-token source breakdown — but it cannot be solved the same way. A mean is scale-free, so `averageAcrossEngines` can evaluate on the union of scrape instants; a sum is not. `cumulativeUniqueInputTokens` turns these rates into token totals with `sum += value` and `rollingAverage` is a sample-count mean, so both only stay correct at **one point per scrape bucket**.

Summing on an exact `start_ns` emitted one point per component per tick, each holding that component's share alone. Downstream that reads as a comb: the rolling average mixed the real samples with the other components' structural gaps and drew roughly 1/N of the cluster total. Two shapes produced it in the corpus — a disaggregated run puts every worker on its own `/metrics` endpoint and its own sub-second offset (~7× low on the 7-worker rows), and even a single-endpoint SGLang run splits its token counters into `is_streaming="true"`/`"false"` series ~16 ms apart, where the `"false"` half is an all-zero run for a fully streaming benchmark (2.2× low).

Every summed series is therefore evaluated by `sumOntoGrid` on one canonical grid at the blob's native scrape cadence (`canonicalTickNs`, the median gap of the best-sampled series), with each component holding its last sample between its own scrapes and contributing only inside its observed window. The lattice is anchored at `t=0` and shared by every metric, so the pairs that get divided or added downstream (hits/queries, used/total, running+waiting) land on identical `t` values — anchoring each metric at its own first sample instead silently emptied the prefix-cache-hit-rate chart, because `sglang:cached_tokens` starts ~0.18 s off the grid `sglang:prompt_tokens` starts on.

Mirrored endpoints are collapsed here too, on a **relative** tolerance rather than the gauge path's absolute one — a throughput mean is O(10⁵), so an absolute threshold would never fire and every mirror would be counted twice. This is a correction as well as a de-duplication: the two-API-server vLLM rows were double-counting their queue depth and token totals exactly 2× before v14.

Nothing groups on an exact `start_ns` any more; `aggregateByStart` was removed in v14.

The detail page does not average the resulting per-tick cache-hit ratios. Cache-hit and
prompt-token counters can publish logically related deltas in adjacent scrape buckets, so a
quiet denominator bucket can make a pointwise ratio exceed 100% even though the run-wide totals
are valid. The displayed line is instead a centered 50-sample ratio of sums —
`Σ(cache-hit rate) / Σ(cache-query rate)` — computed in O(n) with prefix sums. The query-rate
denominator is recovered from the stored pointwise ratio and hit rate, preserving vLLM's
`prefix_cache_queries` semantics; prompt-token rate is only a proxy weight for zero-hit intervals
where `hits / ratio` cannot be inverted. Hit-counter ticks with no stored ratio (zero queries) are
also unioned back into the window rather than dropped. Only after that volume-weighted
aggregation is the semantic `[0, 1]` bound applied as a guard against residual counter timing
skew. Older rows without the component rate series retain the stored-ratio fallback.

### Speculative Decoding Algorithm and Draft Model

`configs.spec_method` is the matrix label (`mtp`, `draft_model`, `none`) and says neither
which algorithm a server ran nor what drafted. InferenceX results carry `spec_algorithm`
(`mtp`, `dspark`, `dflash`, `eagle3`, in the golden AL identity vocabulary) and
`spec_draft_model` (the drafter's repo, or `native` when the served checkpoint drafts for
itself). Ingest stores both in `metrics`, and the AgentX tooltip shows them, for example
"DFlash (RadixArk/Muse-Spark-Open-DFlash2)" or "DSpark (native)". Points without them fall
back to the label.

`db:backfill-spec-algorithm` fills both for stored AgentX points from their server logs
(`etl/server-log-speculation.ts`): vLLM's and ATOM's `SpeculativeConfig`, SGLang's
`server_args`, TensorRT-LLM's speculative config, and TileRT's `num_mtp`. Engines often name
the served checkpoint, or a directory inside `/model`, as the draft model, so only a separate
drafter's name (DSpark, DFlash, EAGLE, NextN, MTP or draft) is reported as one.

### Server-Log Artifact Bundles

Server-log artifacts are stored as filename-keyed bundles rather than as a hard-coded list of
router, worker, or benchmark roles. Ingest recursively retains every regular `.log` and `.out`
file and preserves its artifact-relative path. This applies to both `server_logs_*` ZIPs and
`multinode_server_logs_*` artifacts whose files are nested inside
`multinode_server_logs.tar.gz`. Native srt-slurm single-node runs (fixed-sequence from
2026-09-24, AgentX from 2026-09-26) keep the client logs at the `server_logs_*` artifact root and
put the job's `logs/` directory, including the server worker log `<host>_agg_w0.out`, in
`srt-single-node-logs.tar.gz`. Ingest extracts that archive in place, so its files are stored
under `srt-single-node-logs/` next to the root files; artifacts without the archive read as
before.

The primary file remains in `server_logs.server_log` for compatibility and KV-cache metadata
extraction; `server_log_files` holds the remaining files. `server_logs.file_name` records the
primary file's original path, and `files_complete` distinguishes fully scanned bundles from
legacy single-file rows. Run `bun run admin:db:backfill-server-log-files` to use the public GCS
artifact backup first and fall back to retained GitHub artifacts for recent runs. Pass `--all`
for complete DB history, `--source gcs` to exercise only the backup path, and `--dry-run` to
inventory pair counts and compressed download size without writing. `--run <id>`, `--limit <n>`,
and `--yes` remain available for targeted, idempotent recovery. Bundles already marked
`files_complete` are skipped after their small benchmark artifact is mapped, avoiding repeated
large log downloads. `--force` revisits those bundles and inserts only filenames they do not
already hold, which recovers files a newer artifact reader exposes, such as the single-node
srt-slurm archive.

Each stored file is capped at 128 MiB of UTF-8 text (override with
`SERVER_LOG_MAX_FILE_BYTES`). PostgreSQL rejects any value over 1 GB and drops the connection,
and verbose multinode decode workers can exceed that. An oversized file keeps its first and last
halves, cut at line boundaries, around a marker recording the original size; the complete file
remains in the GitHub artifact and GCS backup. Artifact files are read from disk only up to those
kept bytes, so a multi-GiB frontend log neither exhausts memory nor stalls the event loop long
enough for the pooler to drop the connection. KV-cache metadata is derived from the stored
`server.log`, whose kept head holds the engine startup lines that report KV-cache size.
Server-log writes, trace-replay link checks and trace-replay writes retry up to three times with
backoff on transient connection errors (`CONNECTION_CLOSED`, auth timeouts, SQLSTATE class 08)
because both writers are transactional and re-check existing links.

Full-bundle search stays inside PostgreSQL: each file is scanned through overlapping 4 Mi
character slices matched with `strpos(lower(...))`, and the API returns at most 50 match
contexts rather than transferring the complete file. The overlap preserves literal matches that
cross a slice boundary. Files are processed sequentially so a multinode bundle cannot materialize
every large log in one query. One search scans at most 64 million characters across all files
(`incomplete: true` when that cap stops it) and fails after 25 s.

#### Block storage (migration 021)

A TOAST-compressed text value decompresses from its start, so reading 1 MiB near the end of a
700 MB log took 4-9 s. With migration 021 a file can also be stored in `server_log_blocks` as
independently brotli-compressed blocks of 1 Mi code points (about 24x smaller than the text
column), and a row in `server_log_block_files` marks the file as block-backed once all its blocks
exist. Readers use the blocks for marked files and the text columns otherwise, with identical
results: offsets still count code points, and search keeps the slice loop and scan budget above,
so matches and their context are clipped to each slice exactly as before. A chunk read touches
only the blocks it overlaps (about 100 ms at any offset), and a complete read of a block-backed
file within the byte cap decodes its blocks instead of transferring the text column. Each block
also stores a bloom filter of the case-folded 1-3 grams of its text plus the next 255 code
points. One query lists the bundle's files and asks PostgreSQL which blocks may hold every gram of
the term (`get_bit`). Search skips slices without such blocks and decompresses only the candidate
blocks and the context around a match. Blocks arrive in batched queries: each fetch takes the
blocks it needs plus the next candidate blocks of this and later files (with their successors, for
matches that cross a block boundary), 2, 4, 8 and up to 32 more per query. Skipped slices still
count toward the 64-million-character budget, so `incomplete` is the
same as for the text columns. Matching lowercases both sides exactly as PostgreSQL's `lower()`
does under the database's builtin `C.UTF-8` locale (PostgreSQL 17, Unicode 15.1 simple case
mapping), from a table generated on the database (`queries/server-log-pg-lower.ts`), because
JavaScript's `toLowerCase` differs: `İ` becomes two code points instead of `i`, a word-final `Σ`
becomes `ς` instead of `σ`, and newer engines lower letters PostgreSQL 17 leaves alone. The bloom
query therefore asks for every code point with the same PostgreSQL lowercase as each term
character. Regenerate the table if the database's PostgreSQL major version or locale changes.

`SERVER_LOG_BLOCKS=1` makes ingest write blocks next to the text columns; `ingest-results.yml` sets it.
`bun run admin:db:compact-server-logs` (`--log-id`, `--limit`, `--dry-run`, `--concurrency`) converts
existing files, reading each file's text in ranges of 64 blocks. `--concurrency N` compacts N files at
once on N connections; each file is its own transaction, so an interrupted run resumes by rerunning.
Point `DATABASE_WRITE_URL` at the direct endpoint (no `-pooler` in the host): the pooler closed
connections at 16 and above. Each connection holds up to about 1 GB while it compacts a large file.

### Agentic Dataset Provenance

AIPerf exports public-dataset provenance in `metadata.dataset`, including the Hugging Face dataset ID. InferenceX preserves that object as `dataset` on each agentic aggregate benchmark row. During benchmark ingest, `ingest-ci-run.ts` derives the dashboard slug from `hf_dataset_name` (for example, `semianalysisai/cc-traces-weka-062126` becomes `cc-traces-weka-062126`) and upserts `run_datasets` for the workflow run.

Legacy artifacts without provenance leave any existing mapping untouched. A workflow run can map to only one dataset; conflicting dataset IDs fail ingest rather than silently linking the run to an arbitrary dataset.

### Agentic Replay-Lane Identity

AIPerf can sample one dataset conversation into multiple trajectory lanes, and
those replays may execute concurrently. The source `conversation_id` therefore
identifies dataset provenance, not a unique execution lane. During trace-replay
ingest, `computeRequestTimeline()` groups requests by `root_correlation_id`.
For older exports without that field, it walks `parent_correlation_id` ancestry
from each per-session `x_correlation_id`, so nested subagents resolve to the
main session rather than becoming separate replay lanes. The extractor replaces
the repeated root UUID with a compact, deterministic numeric `ri` ranked by each
lane's first dispatch.

The request-timeline frontend groups by `(conversation_id, ri)`, keeping all
main-agent, subagent, warmup, and profiling requests from one replay together.
Legacy timelines without correlation metadata omit `ri` and retain the older
conversation-only grouping. `REQUEST_TIMELINE_VERSION` invalidates stored
timelines when this extraction changes; `db:backfill-request-timeline`
recomputes them from the raw gzipped `profile_export.jsonl` already stored in
Neon, so no GitHub artifact refetch or schema migration is required.

Timeline extraction reads the gzip stream twice instead of materializing the
entire JSONL. The first pass retains only timeline bounds and one first-dispatch
timestamp per replay; the second emits compact request records. This bounds
peak memory for high-throughput traces whose decompressed profiles exceed
400 MB, at the cost of a second sequential decompression pass during ingest or
backfill. The backfill also downloads the stored profile gzip in 4 MiB chunks
and uploads the derived timeline through the same chunked protocol as trace
ingest, avoiding single-value transport limits for oversized runs.

### Agentic Request-Timeline Storage

Each trace row stores its timeline in `request_timeline_gz`, gzip of the same
versioned JSON document, with `request_timeline_version` and `request_count`
beside it (migration 017). The original `request_timeline` JSONB column failed
at AgentX scale in two ways. PostgreSQL rejects a JSONB array whose elements
exceed 268,435,455 bytes (SQLSTATE 54000), which ingest hit at roughly 500,000
requests, and the largest stored documents could not be read back through
Neon's 64 MiB HTTP response limit. A gzip byte string has no element limit, and
the column uses `EXTERNAL` storage so PostgreSQL neither recompresses it nor
reads more TOAST chunks than one `substring()` slice needs.

Ingest workers and the backfill stream the JSON text into gzip, so neither
holds the serialized document. Readers pick a path from the scalar columns
without detoasting a payload. A current gzip timeline is read in 4 MiB
`substring()` slices, four in flight, each selected as base64 text (about
5.6 MB on the wire instead of 8 MiB of bytea hex, and no bytea parsing in the
Neon driver, whose parser calls the deprecated `Buffer()` constructor). Every
slice re-checks the version and `octet_length`. On the fork, streaming a 52 MB
timeline took 8.7 to 11.8 s in sequential 1 MiB hex reads and 2.3 to 2.8 s this
way.
`request-timeline` returns the whole document, so it decompresses
and parses all of it. `request-chart-data` and `trace-histograms` need a few
fields per request and follow the bounded decode convention of
`etl/gzip-json-stream.ts`: a timeline of up to 16 MiB of JSON is parsed in one
piece, and a larger one is gunzipped and tokenized with stream-json, keeping
only the chart fields or the ISL/OSL values of one request at a time. The
ceiling is lower than the 128 MiB that ingest uses for server metrics because
these reads run in request-serving functions. A stored timeline that cannot be
read (the value changed during the read, corrupt gzip, or malformed JSON) is
logged with its `trace_replay_id` and served as missing data. When no current
timeline is stored, the slow path recomputes it from the profile and writes
back only the gzip form.

Both routes first try `request_chart_data_gz` (migration 024), the exact
`request-chart-data` payload stored column by column
(`etl/request-chart-columns.ts`). Dictionaries and header numbers are stored as
is. Each tuple column is a varint stream: indices plainly, timings and lengths
as zigzag deltas, and TTFT/TPOT as integer microseconds whose division by 1000
reproduces the stored millisecond value bit for bit. A column whose values do
not round-trip that way falls back to raw doubles, so decoding always returns
the same JSON. Ingest and `db:backfill-request-chart-data` derive the columns
from the stored gzip bytes through the same scan the routes use, and
`request_chart_data_version` (the `REQUEST_CHART_DATA_VERSION` they were built
with) must match. The columns are about a fifth of the timeline's size. Up to
4 MiB they come back inline with the metadata query; larger ones use the same
parallel slices. `trace-histograms` decodes only the ISL and OSL columns and
reads up to four points at once. On the fork, the 52 MB timeline's chart data
took 17.5 s to read and scan and 1.4 s from its 9.6 MB of columns. Its
histogram took 14.5 s and 1.8 s. Every writer of `request_timeline_gz` writes or clears the
columns, and the backfill writes only while the timeline's length and MD5 still
match the bytes it read. Unreadable columns are logged and the route falls back
to the timeline.

`resident-sequence-lengths` merges the ISL and OSL token-length sketches of up to
200 chart points per request. In `aggregate_stats.sequenceLengths` each sketch is
a dense JSON count array, about 20 KB per trace row for the pair, so the route
used to read about 4 MB from Neon to add up integers. Migration 026 adds
`sequence_length_sketches`, the same pair as zlib-deflated varint runs of zero
and nonzero bins (`etl/sequence-length-sketch-codec.ts`), about 1.3 KB per row.
The route reads it as base64 when `sequence_length_sketches_version` (the
`SEQUENCE_LENGTH_SKETCHES_VERSION` it was built with, which embeds
`STATS_VERSION`) matches, and merges the counts straight from the bytes into one
array per side. Other rows send their JSON sketches as before, and a payload
that cannot be decoded is logged and replaced by its row's JSON. Only sketches
that `mergeTokenLengthSketches` would merge, with integer fields up to 2^32, are
encoded, so the merged result is the same JSON either way. Every writer of
`aggregate_stats` (ingest, `db:backfill-aggregate-stats` and the route
write-backs) writes or clears both columns in the same statement, and
`db:backfill-sequence-length-sketches` fills existing rows, writing only while
the MD5 of the `aggregate_stats` it read still matches.

Rows ingested before migration 017 keep their JSONB timeline until it is
converted, and readers fall back to it whenever `request_timeline_gz` is null.
That legacy reader reads every current timeline as bounded text chunks and
deliberately does not choose by compressed JSONB storage size, so a highly
compressible timeline cannot cross the response limit or force the database to
materialize the serialized size just to select a read path. `request-chart-data`
still projects a legacy timeline of up to 250,000 requests
(`jsonb_array_length`) in SQL. The projection costs about 155 bytes per request:
trace row 3811's 459,630 requests projected to 71.5 MB, past the response
limit. A larger legacy timeline streams its text chunks through the same
bounded scan instead.

`db:backfill-request-timeline` fills `request_timeline_gz` for every row whose
gzip copy is missing or stale. A row that still holds a current-version JSONB
timeline is converted without reading its profile blob. The script reads the
document header and `jsonb_array_length`, fetches requests in index ranges of
25,000 with `jsonb_path_query_array`, and writes the gzip only when the streamed
count matches the array length before and after streaming. Other rows are
recomputed from the profile. A failed row does not stop the run. It appears in
the closing failure list and makes the script exit nonzero. The opt-in
`--drop-legacy-jsonb` flag sets `request_timeline` to null only when it equals
the gzip copy. The script uploads the decompressed gzip JSON in 4 MiB parts
and lets PostgreSQL compare `request_timeline` with
`convert_from(<uploaded bytes>, 'UTF8')::jsonb`, so neither document crosses the
network whole. A legacy timeline of another version, another request count, or
other content is kept and reported as a failed row. A default run never clears
legacy data.

### Agentic Full-Response Interactivity

Large raw AgentX profiles use `agentic_trace_profile_chunks` (migration 018).
Profiles over 16 MiB compressed are stored in ordered 4 MiB binary rows; smaller
and historical profiles retain the inline `profile_export_jsonl_gz` column.
The trace row records the chunk count, compressed size and SHA-256 checksum.
All parts, metadata and benchmark links commit in the same transaction. Readers
verify each part's size and the complete checksum while streaming the original
gzip bytes. No requests, metrics or timing samples are removed or approximated.
This avoids PostgreSQL's single-value limit even for profiles over 1 GiB.

Chart availability recognizes both inline and chunked profiles. Trace storage size
failures are errors rather than warnings, so an incomplete chart import cannot
produce a green ingestion run.

Agentic charts use full-response inter-token latency as their canonical ITL and
define each interactivity percentile as the reciprocal of the matching ITL
percentile. Current aggregate artifacts provide the namespaced
`*_full_response_itl` fields directly. During ingest those fields replace the
legacy visible-content ITL values in the canonical `*_itl` and `*_intvty` keys.

For artifacts produced before the aggregate field existed, trace-replay ingest
reconstructs each request's decode interval from the retained lifecycle duration
minus TTFT, then divides by `output_sequence_length - 1`. The same helper powers
the one-time `db:backfill-full-response-interactivity` data migration, keeping
historical rows and newly ingested rows on one definition.

### Disaggregated Throughput Basis

Disaggregated rows store `input_tput_per_gpu` per prefill chip, `output_tput_per_gpu` per decode chip, and `tput_per_gpu` per deployment chip. The fixed-sequence producer writes that basis directly. The AgentX producer divides all three by every chip, so `etl/disagg-throughput.ts` moves multinode agentic disaggregated rows to the per-pool basis at ingest and copies the producer's rates to `input_tput_per_total_gpu` / `output_tput_per_total_gpu`.

`admin:db:backfill-agentic-disagg-throughput` applies the same change to stored rows, then refreshes `latest_benchmarks`; run `admin:cache:invalidate <origin> --immediate` afterwards. The benchmark queries apply it on read too, so the app is correct before the backfill and on public-DB copies, whose sync never updates existing rows. Raw SQL readers such as the MCP server see the per-pool basis only after the backfill. A row holding either per-total key is never rescaled twice. Legacy fixed-sequence Dynamo rows (2025-09-29 to 2025-12-05) carry `disagg: true` with no workers and the whole deployment in both pool fields. Most October 2025 rows store rates per deployment chip; later ones store them per pool with unrecorded pool sizes, which the app solves from the rates themselves (`exactPerTotalChipRates` in `lib/benchmarks/chip-basis.ts`). Their chips are counted once. Agentic rows are rescaled at ingest, by the backfill and on read only when they record a real split (workers, or unequal pool fields), the same rule the app uses.

### Agentic Point-Detail Payloads

The point-detail page deliberately splits its immutable trace data by use case.
The default charts fetch `request-chart-data`, a dictionary-encoded tuple
projection containing only conversation, phase, request timing, latency, and
sequence-length fields. The source-rich `request-timeline` document is fetched
only after the user opens the Timeline view. Likewise, `trace-server-metrics`
returns the aggregate series plus source descriptors; a selected endpoint's
full arrays come from `trace-server-metric-source` on demand.

This split is a scale invariant, not only a transport optimization. A high-
throughput point can contain more than 150,000 requests and several copies of
each server series. Reusing either full document for the default view multiplies
JSON parsing, React Query memory, and cache-transfer cost by data the visible
charts do not consume. The Timeline view also virtualizes rows, so the number of
SVG bar/link nodes is bounded by the scroll viewport rather than total request
count.

`trace-server-metrics` reads `chart_series_summary_gz` (migration 025), gzip
JSON of exactly the series fields the route returns. That is the aggregate
series, the per-worker KV overlay averaged from each source's ranks, and the
source descriptors (`etl/chart-series-summary.ts`). `chart_series` repeats every
series once per metric source, so deriving the payload read the whole JSONB.
On the fork the largest point shipped 47 MB from Neon for a 6 MB response and
took 2.5 s. Its summary is 1.2 MB, read inline as base64 in 129 ms. The summary
is built from the series as jsonb returns it. Numbers keep their decimal value
and object keys take jsonb's order (shorter keys first, then bytewise), so the
response bytes match the derived ones (436 of 436 fork points, including the 40
largest). `chart_series_summary_version` embeds `CHART_SERIES_VERSION`. Every
writer of `chart_series` (ingest, `db:backfill-chart-series`, the route's
self-heal) writes both columns in one statement, and
`db:backfill-chart-series-summary` fills rows whose `chart_series` is current,
writing only while its MD5 still matches the text it read. Rows without a
current summary, or with one over 32 MiB, are derived from `chart_series` as
before. A change to the overlay or the payload's series fields bumps
`SUMMARY_FORMAT`.

### Schema Version Detection

`mapBenchmarkRow()`, `mapEvalRow()`, and `mapAggEvalRow()` all use
`resolveConfigTopology()` in `packages/db/src/etl/topology.ts`. It resolves
flat and role-shaped metadata, physical GPU counts, disaggregation, and aggregate
role mirroring before config identity is created:

- **v1 (pre-2025-12-19)**: Only `tp`, `ep`, and `dp_attention` are present. These are copied symmetrically: `prefillTp = decodeTp = tp`, `prefillEp = decodeEp = ep`. Both `numPrefillGpu` and `numDecodeGpu` are set to `tp * ep`.
- **v2 (2025-12-19+)**: Separate `prefill_tp` / `decode_tp` / `prefill_ep` / `decode_ep` / `prefill_dp_attention` / `decode_dp_attention` / `prefill_num_workers` / `decode_num_workers` / `num_prefill_gpu` / `num_decode_gpu` fields are present. These map directly; `num_prefill_gpu` / `num_decode_gpu` fall back to the per-worker count times the role worker count if absent. Legacy per-worker counts use `tp * ep`; explicitly identified SGLang AgentX topology uses `tp * pp * pcp_size`.
- **v3 AgentX single-node**: Nested `request_metrics` with explicit `is_multinode: false` and `disagg: false` uses the producer's physical count, `tp * pp * pcp_size`, when `num_gpus` is absent. EP and DCP share TP devices. Explicit counts win; ambiguous legacy rows retain the TP × EP per-worker fallback. For example, Qwen3.8 H200 TP4/EP4 uses four GPUs, mirrored into both aggregate role columns. GPU counts participate in config identity, so correcting ingestion does not repair existing rows: historical data needs explicit reconciliation against retained artifacts rather than blind reingestion.

The shared v1/v2 role-shape check is `'prefill_tp' in row`; the v3 fallback additionally checks the nested metrics and explicit topology flags. No version field is required in the artifact.

Backfill audit provenance may identify the production config or an exact public
benchmark row (`productionBenchmarkId`); at least one positive ID is required.
Both are audit references only. Selection still uses all stable config dimensions
and the complete run/attempt/point key so staging and rebuilt databases remain
safe. Without a known config ID, the registry conservatively rejects any purge
with the same remaining point identity. The P90 power backfill records original
artifact hashes and windows in `docs/data/power-p90-backfill.json`.

Corrections with `expectedMetrics` are bound to their original telemetry: ingest
requires a known, matching run attempt and leaves the row unchanged if those
source values differ. Database recovery rejects the mismatch before writing.
P90 replays require numeric `power_valid: 1`, schema version 2, and the exact
original average power, including when checking an already-applied correction.

### Shared evaluation and performance topology

Both individual eval artifacts and `agg_eval_all.json` use the same topology
resolver as performance artifacts; their adapters only handle identity and metrics.
For SGLang and Dynamo-SGLang AgentX artifacts with an explicit `is_multinode` marker,
missing physical GPU counts are derived as TP × PP × PCP × workers; EP and DCP share TP devices. Explicit
`num_gpus` or role GPU counts take precedence. Other frameworks and artifacts
without a recognized marker retain their legacy count fallback. AgentX is identified
by its scenario or the eval producer's zero ISL/OSL sentinels. Historical fixed-sequence
artifacts keep their existing GPU-count convention so audited config identities
and run corrections continue to match.

Single-node SGLang eval metadata can mirror one aggregate worker into both
prefill and decode fields. When both roles match the top-level topology, each
has one worker, and no framework/explicit disaggregation signal is present,
ingestion normalizes them to one aggregate configuration. Its mirrored config
columns each hold the same physical count, with zero role-worker counts, matching
the throughput convention. Asymmetric and explicitly disaggregated pools keep
their separate roles.

Node placement (`is_multinode`) does not by itself imply disaggregation. A
prefill-only aggregate deployment can span multiple physical nodes. Actual decode
worker pools and explicit/framework disaggregation signals determine the split.
Legacy role-count fallbacks now include worker multiplicity consistently in both
paths; the old performance fallback omitted it while eval included it.

This corrects mapping of retained artifacts on future ingest; it does not rewrite
existing database rows. Because topology participates in config identity,
already-ingested evals require an audited reconciliation rather than a blind
re-ingest that could leave the incorrect config alongside the corrected one.

### Power Audit Provenance (`power_invalid_reasons`, `power_audit`)

Producers (`aggregate_power.py`) annotate every aggregate result row with two optional provenance fields alongside the `power_valid` verdict:

- **`power_invalid_reasons`** — array of snake_case reason-code strings explaining a withheld verdict (emitted when `power_valid == 0`), e.g. `sampling_gap_exceeded`, `expected_gpu_count_mismatch`.
- **`power_audit`** — compact measurement-window audit object with optional fields: `window_start_unix`, `window_end_unix`, `expected_gpu_count`, `observed_gpu_count`, `sample_count`, `max_sample_gap_s`, `producer_sha`, `exporter_image_sha256`, `source`, `observed_gpu_ids`, `cpu`. `source` is a safe relative path inside the original artifact bundle, except on AgentX rows whose retained window ingest or backfill recovered: there it is the alias `power_validation_<stem>_conc<N>.json` for `LOGS/agentic/conc_<N>/power_validation.json` in `power_audit_<stem>`, and only the window bounds accompany it. Device identifiers may be indices on older collectors. Present on valid and invalid rows alike.

`mapBenchmarkRow()` narrows them defensively (`extractPowerInvalidReasons` / `extractPowerAudit`): reason codes must match `/^[a-z][a-z0-9_]*$/` (≤ 64 chars, deduplicated, capped at 32), audit numerics must be finite (counts: non-negative safe integers), shas collapse to `null` unless a non-empty string ≤ 128 chars, and unknown audit keys are dropped. A failed `benchmark_outcome.status` is rejected as a performance point, retaining its original artifact as evidence. An empty result maps to `undefined`, so the dedicated `benchmark_results.power_invalid_reasons` / `power_audit` JSONB columns (migration 015, mirroring the `workers` precedent from migration 006) store SQL NULL — never `[]` or `{}`. Legacy artifacts without the fields flow through every layer as NULL/undefined.

`queries/benchmarks.ts` selects the columns directly. Its readers need migration 023, which runs after 015, so the columns always exist when those reads run.

### PowerX Telemetry Storage (`gpu_metric_*`, migration 016)

CI persists telemetry so historical reads survive GitHub artifact expiry.
`gpu_metric_series` stores CSV identity and sidecars, `gpu_metric_samples` stores
UTC samples, and `benchmark_result_gpu_metrics` links points to their series.
Each file/host remains separate; multiple benchmark points can share a series.
Ingest prefers paired `gpu_metrics_` artifacts and otherwise reads telemetry from
`power_audit_` bundles. Unchanged inputs only refresh links; changed inputs replace
samples transactionally. A paired artifact that holds no telemetry file (no
`gpu_metrics*.csv` series and no `LOGS/**/samples.csv`), such as a sweep run with
power collection off, marks its points `telemetry_not_collected` rather than
`ingest_failed`. The telemetry API check skips those points, and the PowerX manifest
reports them as one `N telemetry artifact(s) held no telemetry` warning. Telemetry
files that are present but unparseable remain `ingest_failed`.

Native `samples.csv` v2 adds optional `gpu_util_pct`, and v3 adds `temperature_c`.
Ingest stores these readings in the existing GPU sample fields; missing or invalid
readings stay absent. `sm_active` is a distinct measurement with no stored field and
is not treated as GPU utilization.

Run reads use the database when the run has stored telemetry, otherwise GitHub.
The live GitHub read uses native `power_audit_` samples when no matching
`gpu_metrics_` CSV exists; missing temperatures stay unavailable and GPU indices
remain host-local.
Stored responses report `coverage.status` as `complete`, `partial`, or `unknown`,
with `missingArtifacts` naming absent artifacts from the retained run inventory.
Missing files or mismatched sample-count metadata also make coverage partial.
Older series without inventories remain readable with unknown coverage. A re-ingest
with no parseable series preserves historical samples but invalidates their inventory
until a successful repair. Backfill `--all` revisits partial and unknown runs; complete
runs require `--force` or `--run`.
Database errors remain errors. Point reads use linked database series and check their
revision before using cached payloads, so re-ingest needs no manual telemetry-cache
purge. Readers retry if a series changes while its samples are being loaded.

Per-GPU statistics cover the full recording, including startup and warmup, rather
than the serving window. They preserve zero, skip missing readings per metric, and
remain empty when the stored sample count is incomplete. Chart downsampling and GPU
visibility do not change their population. Bump `GPU_STATS_VERSION` when statistical
semantics change so cached point payloads are refreshed.

#### Migration and targeted recovery

No workflow or Vercel deploy applies main-database migrations; apply them by hand before deploying code
that needs them, or readers fail until the migration runs. From the
repository root, with credentials for the reviewed target database, run
`bun run admin:db:migrate --yes` after checking pending migrations. The app and ingest
process must use the same database.

For a repair, retain the original artifact bytes, sidecars and receipt, and snapshot
affected rows. With `DATABASE_WRITE_URL` and `GITHUB_TOKEN` set, preview the target,
then repair it using an absolute receipt path:

```sh
bun run admin:db:backfill-gpu-metrics --run RUN_ID --attempt ATTEMPT \
  --artifact EXACT_ARTIFACT_NAME --dry-run
bun run admin:db:backfill-gpu-metrics --run RUN_ID --attempt ATTEMPT \
  --artifact EXACT_ARTIFACT_NAME --receipt /path/power-publication.json --yes
```

After a parser fix, add `--force` to replace unchanged stored samples. GitHub recovery
accepts only the current attempt; older or expired artifacts require retained original
bytes through `admin:db:ingest:ci`. Never substitute another attempt's artifacts.
Backfill may fill missing AgentX audits, and those
benchmark changes also need the app's API cache refreshed. With its `INVALIDATE_SECRET`:

```sh
bun run admin:cache:invalidate https://TARGET_ORIGIN
bun run admin:cache:warmup https://TARGET_ORIGIN
bun packages/db/src/verify-power-publication.ts /path/power-publication.json https://TARGET_ORIGIN
```

For protected previews, follow the bypass handling in
`.github/workflows/ingest-results.yml`. The cache scripts and the verifier send
`VERCEL_PROTECTION_BYPASS_SECRET` as the bypass header when it is set. Check remaining receipt gaps
and API values; ingest success alone does not establish complete coverage. To undo a
repair, restore the snapshotted rows or original bytes under the same identities.
Do not delete a shared series to repair one point.

#### Precomputed timeline series (`gpu_power_series`, migration 019)

Ingest also stores the `series=power` output per telemetry artifact: the same
`packages/db/src/power-series/` transform the route would run on the samples,
gzipped JSON keyed by `input_key` (series identities plus linked points'
`power_audit`) and `POWER_SERIES_FORMAT_VERSION`. The route serves these rows when
every artifact in scope has a current one and otherwise buckets the samples per
request, so a missing, stale or failed row is slower, never wrong. Incomplete
artifacts get no row and keep returning `STORED_TELEMETRY_INCOMPLETE`.

Run `bun run admin:db:backfill-power-series --yes` once after migration 019, after
bumping `POWER_SERIES_FORMAT_VERSION`, and after point overrides or telemetry
backfills; it rewrites only missing or stale rows (`--run-id ID --force` for one
run). The format-version test fails when a transform file changes without updating
the recorded version and fingerprint.

#### Compressed sample blobs (`gpu_metric_sample_blobs`, migration 022)

Each series can also store its samples as one brotli-compressed columnar blob
(`packages/db/src/lib/gpu-sample-blob.ts`). `loadSeriesDetails` reads a series from
its blob when the row's `format_version` is `GPU_SAMPLE_BLOB_FORMAT_VERSION` and its
`ingested_at` equals the series' `ingested_at`, and from `gpu_metric_samples`
otherwise, so a missing or stale blob is slower, never wrong. The encoder takes the
rows as the SQL read returns them and refuses any value it cannot decode back
identically (float4 values are rebuilt as the shortest decimal PostgreSQL prints),
and every writer compares the decoded blob with those rows before storing it.
`gpu_metric_samples` stays the source of truth. Edit samples only through ingest,
which restamps `ingested_at`.

Ingest writes the blob in the sample transaction when `GPU_SAMPLE_BLOBS=1`, which
`ingest-results.yml` sets; apply migration 022 on a target before ingesting into it. Run
`bun run admin:db:backfill-gpu-sample-blobs --yes` once after migration 022 and after
bumping `GPU_SAMPLE_BLOB_FORMAT_VERSION` (`--run-id ID`, `--limit N` and `--force`
narrow or redo it). `bun run admin:db:verify-gpu-sample-blobs --limit N` compares
blob and row reads of N random points, row for row, and prints sizes and timings.

### Per-run ingest report

`admin:db:ingest:ci` writes `INGEST_REPORT_OUTPUT` (JSON, `packages/db/src/etl/ingest-run-report.ts`)
and appends the same counts to the job summary, for success and failure alike. It counts what this
run wrote, unlike `admin:db:verify`, which prints whole-database totals. Rows are `benchmark`
(benchmark_results rows), `eval` (eval_results rows), `trace` (agentic benchmark rows linked to a
trace_replay blob) and `power` (gpu_metrics series; `unmapped` counts power result rows the mapper
could not place). Columns are `new`, `duplicate`, `skipped` (failed-run rows, rows held by per-job
files, purged points, missing siblings, telemetry not collected), `unmapped` and `failed` (database
write or telemetry errors). For
dispatched merge ingests it also sends `ingest-results-completed` to `BENCHMARK_REPO`, whose
`ingest-results-callback` workflow comments the counts on the merged PR.

A dispatched ingest whose artifacts come from the dispatching run first polls that run every 10 s
until GitHub reports it completed, for at most 300 s, and then proceeds either way.
`admin:db:prepare:ci` downloads the planned artifacts eight at a time, largest first, and starts no
new download after one fails its three attempts. It skips `job_event*` and `al_gate*` artifacts and
server logs without a same-suffix `bmk_` artifact, since ingest never reads them. `admin:db:verify`
runs after cache invalidation, warmup and the PowerX check, so its whole-database counts never delay
fresh data. The invalidate request is capped at 120 s per curl attempt so a slow blob purge cannot
hold the job for minutes.

### PowerX publication receipts

The normal CI importer writes `POWER_PUBLICATION_MANIFEST` when configured. Each
point at a PowerX workload (`POWER_WORKLOADS`: 8K/1K, 1K/1K, AgentX) records the
mapped, override-adjusted metric contract, all configuration dimensions, original
source run/attempt, structured audit, and input file SHA-256. Reused sweeps keep
their original source identity. Unmapped results at those workloads, and failed
config writes for their rows, remain in the manifest as `ingestErrors`; they cannot
pass verification. Results the benchmark itself marked failed are excluded on purpose:
they are listed under `publicationWarnings`, copied into the verification receipt, and
never fatal. Other database write failures do not enter the manifest. The ingest
writes them to the database write receipt (`DATABASE_WRITE_RECEIPT`) as
`{ kind, subject, message, code }` entries, where `code` is the SQLSTATE or
postgres.js client code. The workflow step "Check database writes" runs even after
an earlier step fails, annotates each entry on the run page, fails on errors, and
adds a short summary to the Slack failure message. Known failures listed in
`DB_WRITE_WARNING_RULES` (`etl/skip-tracker.ts`) are warnings instead: they are
annotated but not counted or fatal.

After ingestion and cache invalidation, `bun packages/db/src/verify-power-publication.ts
power-publication.json` compares every expected point against the exact database
run attempt and public `runId=…&exactRun=true` response. It checks missing values and
withheld telemetry as well as numbers; legacy missing measurements remain missing.
A `matched` receipt establishes transport fidelity, not collection coverage. An
empty receipt says `no_power_points`, never that power coverage was validated.
The workflow retains both the input manifest and verification receipt. Cache
invalidation errors fail the workflow instead of being swallowed. Imported P75/P90
ledger edits trigger the existing reviewed override workflow.

### Serving large request timelines

The request-timeline API streams current-version `request_timeline_gz` directly
in bounded 4 MiB database reads, four in flight. It preserves every request and
the existing JSON contract and CDN headers, without expanding the full document
or putting it through the parsed-object Blob cache. Reads stay at most four
slices ahead of the response and stop on cancellation. Legacy or stale
timelines use the existing computation/cache path.

Migration 027 adds `request_timeline_sha256`. A row trigger sets it to
`sha256(request_timeline_gz)` on every insert and on every update that names
either column, so no writer can store a wrong digest and setting it to null
recomputes it. `db:backfill-request-timeline-sha256` does exactly that for rows
written before the migration (4,723 fork rows in 293 s).

The digest names immutable copies in Vercel Blob under
`$BLOB_CACHE_PREFIX/content/` (`lib/cache/content-blob.ts`).
`request-timeline` keys the stored gzip bytes themselves.
`request-chart-data` keys the gzip of its JSON by `REQUEST_CHART_DATA_VERSION`
and the timeline digest, and `trace-histograms` keys it by its version and every
requested point's `id:digest`. A route reads only the digest (one Neon round
trip, about 45 ms on the fork), checks the public Blob URL with a HEAD request,
and answers a client that accepts gzip with a CDN-cacheable `307` to it. The
function never touches the bytes. Before the copy exists the route serves the
response as before and stores the copy after responding. A streamed timeline is
hashed on the way through, and its multipart upload completes only when the
bytes match the digest, so a rewrite mid-read or a cancelled response leaves no
blob. Chart and histogram responses are stored only when they come from current
digests, and histograms only when no point was dropped.

The redirect target holds the same body bytes (the stored gzip, or gzip of the
same JSON) but is served as `Content-Type: application/gzip` without
`Content-Encoding`, with no ETag. `useByIdQuery` decodes such bodies with
`DecompressionStream` (`lib/api/gzip-json-response.ts`). Clients whose
Accept-Encoding excludes gzip are never redirected. A results purge keeps the
`content/` subtree because its keys change with the data, and an immediate purge
deletes it too.

On the fork, deciding the redirect took 45 to 50 ms for the 2, 10 and 147 MB
timelines, which streamed in 401, 964 and 9,743 ms (medians of five,
interleaved). Chart data and histograms of the 10 MB timeline took 2,960 and
2,699 ms to compute against 43 ms for the digest.
