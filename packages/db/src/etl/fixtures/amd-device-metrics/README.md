# AMD device-metrics fixture

Sanitized excerpt from InferenceX run `36164037147`, artifact `10881696541`,
`logs/power/manifest.json` and `samples.csv`, retained in the 2026-09-29 AMD audit.
The fixture keeps the first three GPU 0 rows and the collector contract fields.
Only the hostname and device UUID have been replaced. Unrelated manifest fields,
including full-file hashes and counts, are omitted.

The source really combines `producer: srt-slurm.dcgm-power` with
`power_profile: amd-device-metrics` and `source_metric: gpu_power_usage`.
The original `publication_valid: true` is preserved as producer evidence; this
historical exporter capture had known stale-cache behavior and does not establish
measurement qualification. Repeated 241 W values are preserved, not corrected.

The readback test adds a synthetic second host with GPU 0 and a synthetic selected
window. These additions exercise host identity and chart reconstruction; they are
not a real multi-host AMD measurement. Utilization columns are retained in the
source CSV but the existing bundle reader persists only power.
