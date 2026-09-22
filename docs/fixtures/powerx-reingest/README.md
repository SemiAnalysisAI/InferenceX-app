# Retained telemetry for re-ingest recovery

`nvidia.csv` contains unchanged readings from the public InferenceX B200/Qwen3.5
run [34175132645, attempt 1](https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34175132645/attempts/1).
`provenance.json` records the original artifact name, full-file SHA-256, physical
line ranges and derived-file SHA-256. Tests read these committed bytes; no artifact
download is required.

Retain original line 1 and lines 2898–2921, joined with LF and a final LF: three
consecutive samples of all eight GPUs, 24 rows / 1,901 bytes. Headers, units,
timestamps and values are unchanged. The CSV contains no hostnames or UUIDs, so
no identity anonymization was needed. The original collector version and timezone
are unknown. The file hash identifies the source bytes independently of those
unknowns.

The UTC context, collector labels, identity sidecars, local benchmark rows and
repair offsets used by tests are **constructed test inputs**. They do not describe
a correction to the original run. No original energy/quality claim is attached to
this cropped fragment. It proves retained-format parsing and recovery through the
consumer, not GPU collection reliability or serving-window qualification.

Fixed checks come directly from the retained rows: GPU 0 has
`380.42, 336.61, 337.18 W`; with the explicit UTC test context the range is
`2026-09-08T07:20:19.279Z`–`2026-09-08T07:20:21.279Z`. Its sample mean is
`351.4033333333333 W`. Production parsers/statistics functions must not generate
test expectations.

Run the recovery checks from the repository root after the lockfile dependencies,
Cypress binary and PostgreSQL 17 tools are installed:

```sh
bun run --cwd packages/db test:unit src/etl/gpu-metrics-ingest.test.ts --maxWorkers=2
(cd packages/app && bun node_modules/vitest/vitest.mjs run src/app/api/v1/gpu-metrics-point/route.test.ts --maxWorkers=2)
POWERX_ACCEPTANCE_APP_PORT=3157 POWERX_ACCEPTANCE_PG_PORT=3158 \
  bun run --cwd packages/app test:e2e:powerx /absolute/fresh/output-directory
```

The API test uses PGlite, the production parser/ingest/query/cache/point handler,
and the real Blob SDK with a local HTTP transport. Its four cases retain
missing→present, shared links, timezone/identity repair, no-op, cache-write failure
and retry, and DB failure. The ingest tests separately check actual late FK
rollback and second-series failure followed by repair; they do not claim whole
artifact atomicity.

The browser driver creates a disposable loopback PostgreSQL database, runs real
migrations and ETL, then starts Next.js and Cypress. The two retained-source cases
populate old cache entries for both shared points, repair constructed sidecars,
and check API values plus EN desktop / ZH mobile focus, reopen and no-op behavior.
The original eight synthetic browser cases remain. Successful telemetry responses
are never substituted. The seed verifies the excerpt hash before database writes
and records it in `seed-receipt.json`; `blob-receipt.json` records both revisions.

`POWERX_PG_BIN` selects the PostgreSQL bin directory; app/PG ports default to
3137/3138 and must be unused. Use a fresh output directory each time. The driver
stops its owned Next, PostgreSQL and Blob fixture and records cleanup errors.
This local check needs no artifact download or production credentials. Ancillary
site stars/font traffic is not blocked by this driver, so it does not establish
strict network-isolated execution. Hosted Neon, Blob/CDN and deployment are not
covered. No collector or telemetry-validity policy changes are included.
