# Legacy AMD-SMI GPU power retirement

The source policy retires GPU W/J from two raw-verified direct AMD-SMI `socket_power` points, results `431819` and `443533`. This is a provenance decision, not a failed numerical validation. Benchmark performance, CPU metrics, validation/audit metadata, nonpower telemetry, and original artifacts remain. The exact source and portable point identities are in `packages/db/src/lib/legacy-amd-smi-raw-points.json`; the [operator runbook](../packages/db/README-legacy-amd-smi-retirement.md) gives the dry-run, apply, and cache order. No production apply or cache invalidation is established by this repository change.

## Read-only source inventory

The evidence file supplies `source_identified_points`. The preview independently checks each source record's run ID, attempt, commit, collector command, hardware, original CSV path, SHA-256, and `timestamp,gpu,socket_power` header. With `--db`, it uses `DATABASE_READONLY_URL` to compare those records with retained AMD benchmark rows; it does not mutate data. Code-only manifests remain dispatch-unverified and are rejected as retirement evidence.

```sh
bun packages/db/src/preview-amd-smi-retirement.ts \
  --evidence /path/to/source-findings.json \
  --artifact-root /path/to/retained-artifacts \
  --db > /path/to/amd-smi-db-preview.json
```

The October 5, 2026 production read-only preview found 2 verified rows among 3,172 AMD power-key/telemetry rows. The other **3,170 rows remain unresolved and outside the executable policy**; they are not presumed to use AMD-SMI. Production did not yet have GPU telemetry tables, so historical series coverage was unknown. The writer rechecks the two exact identities under lock and removes only their GPU W/J; replay and read paths apply the same source guard. An unresolved row must not be retired merely because its hardware, date, or metric resembles the two verified sources.
