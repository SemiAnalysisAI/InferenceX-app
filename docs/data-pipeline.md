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

The unique constraints match natural keys (e.g., `(workflow_run_id, config_id, isl, osl, conc)` for benchmarks), not surrogate keys.

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

## Frontend Transform Pipeline

### Why transformBenchmarkRows Exists

API returns flat `BenchmarkRow[]`. Charts need `InferenceData[]` with:

- Hardware key resolution (combines hw + framework + precision + spec_decoding)
- Display name mapping (DB keys → human labels)
- Derived metrics (cost per token, energy per token, throughput per MW)
- Roofline computation (Pareto fronts per metric per hardware group)

This transform runs client-side because:

1. It depends on HARDWARE_CONFIG (frontend constant with colors, costs, power)
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
3. **Validate against `GPU_KEYS`** (the canonical set from `@semianalysisai/inferencex-constants`).
4. **Return null** if the stripped base is not in the set. The raw value is added to `tracker.unmappedHws`.

### Framework Normalization

`normalizeFramework(fw, disaggField)` resolves a raw framework string to a canonical name and a disaggregated-inference flag:

1. Look up `fw.toLowerCase()` in `FRAMEWORK_ALIASES` (defined in `packages/constants/src/framework-aliases.ts`).
2. If a match exists, use `alias.canonical` as the framework name and `alias.disagg` as the disagg flag. Example: `sglang-disagg` → `{ framework: 'mori-sglang', disagg: true }`.
3. If no alias exists, the lowercased raw string is used as-is.
4. The disagg flag falls back to the raw `disaggField` from the artifact (coerced via `parseBool`, accepting `true`, `"true"`, `"True"`).

`FRAMEWORK_ALIASES` keys are sorted longest-first in `SORTED_ALIASES` (used by `resolveFrameworkAliasesInString`) to prevent substring conflicts — `dynamo-trtllm` must be matched before `trtllm`.

### Schema Version Detection

`mapBenchmarkRow()` detects which artifact schema version is present by checking for the `prefill_tp` field:

- **v1 (pre-2025-12-19)**: Only `tp`, `ep`, and `dp_attention` are present. These are copied symmetrically: `prefillTp = decodeTp = tp`, `prefillEp = decodeEp = ep`. Both `numPrefillGpu` and `numDecodeGpu` are set to `tp * ep`.
- **v2 (2025-12-19+)**: Separate `prefill_tp` / `decode_tp` / `prefill_ep` / `decode_ep` / `prefill_dp_attention` / `decode_dp_attention` / `prefill_num_workers` / `decode_num_workers` / `num_prefill_gpu` / `num_decode_gpu` fields are present. These map directly; `num_prefill_gpu` / `num_decode_gpu` fall back to `tp * ep` if absent.

Detection is a single `'prefill_tp' in row` check — no version field is required in the artifact.
