# Data Pipeline Design

## DB Schema Decisions

### Why JSONB + Hot Columns (Hybrid)

Benchmark metrics are stored in a JSONB `metrics` column AND extracted into dedicated "hot" columns (`tput_per_gpu`, `median_intvty`, `median_ttft`, `median_e2el`, `p99_ttft`, `median_tpot`).

- **JSONB**: New metrics can be added by CI without schema migrations. Old data doesn't need backfilling — missing fields default to 0 at read time (`m.field ?? 0`).
- **Hot columns**: The most-queried metrics need B-tree indexes for `DISTINCT ON` queries. JSONB extraction (`metrics->>'field'`) can't use these indexes efficiently.
- **Trade-off**: ~6 duplicated values per row. Acceptable because benchmark_results is write-once/read-many, and the index speedup on daily queries is orders of magnitude.

### Why Denormalized Dates

`benchmark_results.date`, `workflow_runs.date`, and the `availability` table all store denormalized date values (derived from `workflow_runs.created_at`). This avoids JOINs in the hottest queries:

- `getLatestBenchmarks` uses `DISTINCT ON (config_id, conc, isl, osl) ORDER BY date DESC` — needs date on the same table as benchmark_results for the covering index.
- `availability` is a separate denormalized table because the date-picker query (`SELECT DISTINCT model, date`) needs to be fast without scanning benchmark_results.

### Why a Materialized View (latest_benchmarks)

The `DISTINCT ON` query for "latest benchmark per config" is expensive on the full table (millions of rows). The materialized view pre-computes this, refreshed concurrently after each ingest. API routes use the view when no date filter is specified; date-filtered requests hit the base table.

`REFRESH CONCURRENTLY` allows reads during refresh (no downtime). The trade-off is a brief window where the view is stale after ingest — acceptable since data changes at most daily.

### Why Idempotent Ingestion

Every INSERT uses `ON CONFLICT DO UPDATE` or `DO NOTHING`. This means:

- **Re-running ingest is safe**: Same CI run ingested twice produces identical results.
- **Partial failures recover**: If ingest crashes mid-batch, re-running picks up where it left off.
- **No cleanup needed**: No "delete old data first" step that could leave the DB empty on failure.

The unique constraints match natural keys (for benchmarks, workflow/config/scenario,
concurrency, offload mode, and the nullable recipe fingerprint), not surrogate keys.

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
All appended points must retain the target curve's image, and benchmark-affecting code
changes must be isolated to the new points.

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

`bun run db:apply-overrides` previews every matching row and requires confirmation
before deleting it in a transaction. It also removes unreferenced server logs and
trace-replay sidecars, clears availability entries that no remaining successful row
supports, and refreshes `latest_benchmarks`. The override remains in source control,
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
metadata in one correction. Unrelated metrics remain unchanged.

Run `bun run admin:db:apply-overrides` to preview the exact rows, reasons, and patches;
the command requires confirmation unless passed `--yes`. It fails before writing when a
target is missing, when a point's desired identity already exists, or when registry
validation finds an overlap or duplicate. Writes are verified against the declared state
and `latest_benchmarks` is refreshed afterward. Merges to `master` run the same command in
CI, followed by database verification, cache invalidation, and cache warmup.

Point corrections are additionally applied before each CI or GCS benchmark insert. This
prevents a later idempotent re-ingest from restoring the artifact's original value. The
ingest tracks source and desired identities across the run and fails on a collision instead
of silently collapsing two distinct artifact points. When GCS cannot recover an attempt
number, it follows the purge path's conservative fallback and matches the exact run and
point across attempts; the log records the applied backfill ID. Changelog corrections are
likewise applied to artifact metadata before `appendOnly`/`evalsOnly` run semantics are
resolved and before the changelog is upserted.

### Why Two Connection Types

| Connection                      | Library     | Use Case                             | Why                                                                                                  |
| ------------------------------- | ----------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `@neondatabase/serverless` HTTP | API routes  | Stateless, read-only, scales to zero | Serverless functions can't hold persistent connections; HTTP driver works over Vercel's edge network |
| `postgres` TCP                  | ETL scripts | Bulk inserts, transactions, COPY     | HTTP driver has per-query overhead that's unacceptable for 10K+ row batches                          |

The read replica (`DATABASE_READONLY_URL`) is used by API routes to isolate read traffic from write load. ETL uses the primary writer (`DATABASE_WRITE_URL`).

### Why CHECK Constraints for Lowercase

All text keys (model, hardware, framework, precision) have `CHECK (field = lower(field))`. This prevents case-sensitivity bugs where `H100` and `h100` create duplicate configs. The constraint is enforced at the DB level, not the application level, because multiple ingest paths (CI action, GCS backfill, manual scripts) all write to the same tables.

## ETL Design

### Two-Phase Parallel Ingestion

Phase 1 (parallel 20): ZIP reading + JSON parsing + row mapping. IO-bound (network + disk), so high parallelism.

Phase 2 (parallel 5): DB writes. Connection-limited (max 20 connections), and each write does config lookup + bulk insert. Lower parallelism prevents connection exhaustion.

### Config Cache

Configs are preloaded into an in-memory Map at ingest start. `getOrCreateConfig()` checks the cache first, hits DB only for genuinely new configs. This avoids N+1 queries — without the cache, each benchmark row would need a separate config lookup.

### Skip Tracking

Unmapped models/hardware are tracked (not silently dropped) so operators can see what new GPU or model names appeared in CI artifacts. This is how new GPUs get added to the system — the skip tracker acts as a change detection mechanism.

### Server-Metric Orchestrator Adapters

AIPerf defines the `server_metrics_export.json` envelope, but labels such as worker role and rank belong to the serving orchestrator. The chart-series ETL therefore normalizes raw series through an orchestrator-specific adapter before exposing per-worker metrics. For example, the Dynamo adapter maps `dynamo_component=prefill|backend` to canonical `prefill|decode` roles and uses the endpoint, worker ID, DP rank, and engine together as the source identity.

Adapters are selected from the benchmark's canonical framework, and per-worker series are only emitted for disaggregated configs with a recognized adapter. Unknown orchestrators and non-disaggregated configs retain their aggregate-only series; roles are never guessed from ports or metric names. The frontend only consumes the canonical source identity and never interprets orchestrator-native labels.

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
conversation-only grouping. `REQUEST_TIMELINE_VERSION` invalidates derived
JSONB when this extraction changes; `db:backfill-request-timeline` recomputes it
from the raw gzipped `profile_export.jsonl` already stored in Neon, so no GitHub
artifact refetch or schema migration is required.

Timeline extraction reads the gzip stream twice instead of materializing the
entire JSONL. The first pass retains only timeline bounds and one first-dispatch
timestamp per replay; the second emits compact request records. This bounds
peak memory for high-throughput traces whose decompressed profiles exceed
400 MB, at the cost of a second sequential decompression pass during ingest or
backfill. The backfill also downloads the stored gzip and uploads the derived
JSONB in 4 MiB chunks, matching trace ingest and avoiding single-value transport
limits for oversized runs. The request-timeline reader returns ordinary JSONB
inline, but reconstructs unusually large current timelines from bounded text
chunks so no individual Neon HTTP response crosses the 64 MiB platform limit.

### Agentic Full-Response Interactivity

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

## Frontend Transform Pipeline

### Why transformBenchmarkRows Exists

API returns flat `BenchmarkRow[]`. Charts need `InferenceData[]` with:

- Hardware key resolution (combines hw + framework + precision + spec_decoding)
- Display name mapping (DB keys → human labels)
- Derived metrics (cost per token, energy per token, throughput per MW)
- Roofline computation (Pareto fronts per metric per hardware group)

This transform runs client-side because:

1. It depends on HW_REGISTRY (shared constants with vendor, arch, costs, power)
2. Different chart types need different x/y metric extractions
3. Roofline computation depends on the user's selected metric direction

### Why Spline Interpolation Uses Steffen Method

The TCO Calculator and Historical Trends interpolate metrics at a target interactivity value. The Steffen method (monotone cubic Hermite) was chosen because:

1. **Monotonicity**: Prevents the spline from overshooting between data points. Standard cubic splines can produce negative throughput values between two positive points.
2. **D3 compatibility**: Matches `d3.curveMonotoneX`, so the interpolated values align visually with the roofline curves drawn on charts.
3. **Clamping**: Even with Steffen, edge cases (sparse data, steep gradients) can produce negative values. All results are clamped to `Math.max(0, ...)`.

### Why Multi-Precision Uses Composite Keys

When comparing FP4 vs FP8 for the same GPU, each precision needs its own Pareto front. Without composite keys (`hwKey__precision`), all precisions would be mixed into one front, producing invalid rooflines that connect FP4 and FP8 data points.

The `__` separator is intentional — it can't appear in hwKey (which uses `-` and `_`) or precision names.

## Normalizer Resolution Order

All normalizer logic lives in `packages/db/src/etl/normalizers.ts`. The functions below are called by `mapBenchmarkRow()` in `benchmark-mapper.ts`; any row that cannot be fully resolved is counted by `SkipTracker` and dropped.

### Model Key Resolution

`resolveModelKey(row)` applies the following steps in order:

1. **Prefer `infmax_model_prefix`** (or `model_prefix` for eval artifacts). This canonical field was added 2025-12-08 and is the authoritative source for all recent runs.
2. **Strip precision suffixes** from the prefix (`-fp4`, `-fp8`, `-mxfp4`, `-nvfp4`), then check the resulting string against `DB_MODEL_KEYS` (derived from `DB_MODEL_TO_DISPLAY`).
3. **Check `PREFIX_ALIASES`** for prefixes that still don't match after suffix stripping (e.g. `gptoss` → `gptoss120b`).
4. **Fall back to `model` field** → lookup in `MODEL_TO_KEY`. This map covers all historical variants: HuggingFace paths (`deepseek-ai/DeepSeek-R1`), local mounts (`/mnt/lustre01/models/...`), and shorthand names (`dsr1-fp8`).
5. **Return null** if neither path resolves. The row is skipped and the raw value is added to `tracker.unmappedModels` so operators can detect new model names in CI artifacts.

### Hardware Key Resolution

`hwToGpuKey(hw)` applies the following steps in order:

1. Lowercase and **strip runner index suffix** with `/_\d+$/` (e.g. `mi355x_0` → `mi355x`).
2. **Strip known framework/config suffixes** in a fixed order: `-trt`, `-multinode-slurm`, `-multinode`, `-nvs`, `-disagg`, `-amds`, `-amd`, `-nvd`, `-dgxc`, `-nb`, `-nv`. The order matters — longer suffixes (`-multinode-slurm`) are matched before their substrings (`-multinode`, `-slurm`).
3. **Validate against `HW_REGISTRY`** (the canonical GPU registry from `@semianalysisai/inferencex-constants`).
4. **Return null** if the stripped base is not in the set. The raw value is added to `tracker.unmappedHws`.

### Framework Normalization

`normalizeFramework(fw, disaggField)` resolves a raw framework string to a canonical name and a disaggregated-inference flag:

1. Look up `fw.toLowerCase()` in `FRAMEWORK_ALIASES` (defined in `packages/constants/src/framework-aliases.ts`).
2. If a match exists, use `alias.canonical` as the framework name and `alias.disagg` as the disagg flag. Example: `sglang-disagg` → `{ framework: 'mori-sglang', disagg: true }`.
3. If no alias exists, the lowercased raw string is used as-is.
4. An explicit `disagg` field is authoritative for canonical `dynamo-*` frameworks because Dynamo can orchestrate either a disaggregated deployment or one distributed server. Boolean and lowercase/Python-style string values are accepted.
5. Legacy `dynamo-*` artifacts that omit or do not provide a recognizable `disagg` value fall back to `true`. Canonical `mori-*` frameworks remain intrinsically disaggregated.
6. Mapper-level topology validation still marks a deployment as disaggregated when it has a non-zero decode worker pool, preserving older genuinely disaggregated Dynamo artifacts that incorrectly emitted `disagg: false`.

`FRAMEWORK_ALIASES` keys are sorted longest-first in `SORTED_ALIASES` (used by `resolveFrameworkAliasesInString`) to prevent substring conflicts — `dynamo-trtllm` must be matched before `trtllm`.

### Schema Version Detection

`mapBenchmarkRow()` detects which artifact schema version is present by checking for the `prefill_tp` field:

- **v1 (pre-2025-12-19)**: Only `tp`, `ep`, and `dp_attention` are present. These are copied symmetrically: `prefillTp = decodeTp = tp`, `prefillEp = decodeEp = ep`. Both `numPrefillGpu` and `numDecodeGpu` are set to `tp * ep`.
- **v2 (2025-12-19+)**: Separate `prefill_tp` / `decode_tp` / `prefill_ep` / `decode_ep` / `prefill_dp_attention` / `decode_dp_attention` / `prefill_num_workers` / `decode_num_workers` / `num_prefill_gpu` / `num_decode_gpu` fields are present. These map directly; `num_prefill_gpu` / `num_decode_gpu` fall back to `tp * ep` if absent.

Detection is a single `'prefill_tp' in row` check — no version field is required in the artifact.
