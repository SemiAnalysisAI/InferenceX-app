# PowerX persistence and repair

PowerX point detail, the run explorer and Power Timeline read migration-016 telemetry
from the database. Timeline applies the same prefix selection, validation-window cuts,
60-second padding and one-second per-device means as the artifact path. Stored samples
retain UTC timestamps, original units and separate host-local GPU identities. GitHub
remains the fallback for telemetry that has not been stored. Database failures return an
error, not an empty result or an artifact fallback.

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
