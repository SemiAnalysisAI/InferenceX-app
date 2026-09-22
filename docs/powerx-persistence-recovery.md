# PowerX persistence and repair

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
