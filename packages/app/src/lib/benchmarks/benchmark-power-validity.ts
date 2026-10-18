/**
 * Measured-power validity filtering for the public benchmarks API.
 *
 * `metrics.power_valid` is tri-state: 1 means the measurement window was
 * validated, an explicit 0 is an authoritative invalid verdict (measured
 * values are withheld end-to-end), and an absent key marks a legacy row that
 * predates validation. The only public filter, `strictV2`, requires a valid
 * verdict and `power_metric_schema_version === 2`, mirroring
 * `WHOLE_DEPLOYMENT_ENERGY_SCHEMA_VERSION` in `benchmark-transform.ts` and
 * `POWER_METRIC_SCHEMA_VERSION` in the runner's `utils/aggregate_power.py` —
 * only version 2 defines unprefixed `joules_per_*` fields as whole-deployment
 * energy. The name is deliberately not `certified`: the UI's certified tier is
 * a display rule that also admits validated legacy rows without a schema
 * version, which `strictV2` excludes.
 */
export const POWER_VALIDITY_FILTERS = ['strictV2'] as const;
export type PowerValidityFilter = (typeof POWER_VALIDITY_FILTERS)[number];

/** Absent param means no filtering; unknown values return undefined so the caller can 400. */
export function parsePowerValidityFilter(
  raw: string | null,
): PowerValidityFilter | null | undefined {
  return raw === null || raw === 'strictV2' ? raw : undefined;
}

/**
 * Pure post-cache row filter. An omitted parameter preserves general benchmark
 * results, including rows with no power measurement.
 */
export function filterByPowerValidity<T extends { metrics?: Record<string, unknown> }>(
  rows: readonly T[],
  filter: PowerValidityFilter | null,
): T[] {
  if (filter === null) return [...rows];
  return rows.filter(
    (row) => row.metrics?.power_valid === 1 && row.metrics?.power_metric_schema_version === 2,
  );
}
