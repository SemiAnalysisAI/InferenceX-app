# Retained telemetry for re-ingest recovery

`nvidia.csv` contains unchanged readings from the public InferenceX B200/Qwen3.5
run [34175132645, attempt 1](https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34175132645/attempts/1).
Tests read these committed bytes; no artifact download is required.

Retain original line 1 and lines 2898–2921, joined with LF and a final LF: three
consecutive samples of all eight GPUs, 24 rows / 1,901 bytes. Headers, units,
timestamps and values are unchanged. The CSV contains no hostnames or UUIDs, so
no identity anonymization was needed. The original collector version and timezone
are unknown.

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

Run the recovery check from `packages/app`:

```sh
bun node_modules/vitest/vitest.mjs run src/app/api/v1/gpu-metrics-point/route.test.ts
```

The test uses PGlite, the production parser/ingest/query/cache/point handler, and
the real Blob SDK with a local HTTP transport. It checks live revisions for
successful and missing responses, then refreshes a missing point, shared links and
timezone/identity repairs without purging.
