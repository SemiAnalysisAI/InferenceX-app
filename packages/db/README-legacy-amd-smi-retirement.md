# Legacy AMD-SMI GPU power retirement

This source policy retires GPU watts and GPU joules for two raw-verified AMD-SMI benchmark points. It preserves benchmark performance, CPU metrics, validity and audit fields, worker temperature and utilization, nonpower GPU telemetry, and raw source artifacts. The exact run, attempt, commit, point identity, and CSV SHA-256 are recorded in `src/lib/legacy-amd-smi-raw-points.json`. Replay, database reads, and GitHub artifact fallback use the same source policy, so restoring an old artifact does not restore its retired watts.

As of the October 5, 2026 read-only production inventory, the executable scope is results `431819` and `443533`: 2 verified rows out of 3,172 AMD rows with power keys or telemetry. The other **3,170 remain unproven and are excluded**. Code-based candidates lack exact launch selection or raw CSV proof; do not add them to the policy from hardware, date, or a manifest match alone. Production had no `gpu_metric_series` or `benchmark_result_gpu_metrics` tables at that snapshot, so stored telemetry coverage there was unknown.

Run from `packages/db` after loading the target environment. No production retirement has been applied by this change.

1. Deploy the source guard and applicable database migrations, then run `bun run db:retire-legacy-amd-smi-power` with `DATABASE_READONLY_URL`. Its default mode is read-only and must report exactly two source identities; review the targets and telemetry-table state before proceeding.
2. In an approved maintenance operation with `DATABASE_WRITE_URL`, run `bun run db:retire-legacy-amd-smi-power --apply --yes`. The command locks and rechecks the two identities, removes only GPU W/J, and refreshes `latest_benchmarks`. A retry is safe and refreshes the view even if a previous attempt committed but the refresh failed. Re-run the dry-run; it should report zero rows with retired GPU power. If telemetry tables are added later, repeat the dry-run and apply to retire any matching historical series.
3. Invalidate the deployed app cache with the existing `admin:cache:invalidate` command and verify the two point/API views have no watts while temperature remains, and a fresh AMD DME control still has watts. Do this after the database apply; a stale public cache can otherwise serve retired values.

The October 5 local evidence includes a PostgreSQL 17 apply/replay/idempotence check and desktop/mobile browser checks. The production inventory and dry-run receipts are in the PowerX closeout directory; neither performed a write.
