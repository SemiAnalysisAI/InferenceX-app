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
