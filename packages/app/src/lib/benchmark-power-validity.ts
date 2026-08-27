/**
 * Measured-power validity filtering for the public benchmarks API.
 *
 * `metrics.power_valid` is tri-state: 1 means the measurement window was
 * validated, an explicit 0 is an authoritative invalid verdict (measured
 * values are withheld end-to-end), and an absent key marks a legacy row that
 * predates validation. `strictV2` additionally requires
 * `power_metric_schema_version === 2`, mirroring
 * `WHOLE_DEPLOYMENT_ENERGY_SCHEMA_VERSION` in `benchmark-transform.ts` and
 * `POWER_METRIC_SCHEMA_VERSION` in the runner's `utils/aggregate_power.py` —
 * only version 2 defines unprefixed `joules_per_*` fields as whole-deployment
 * energy. The name is deliberately not `certified`: the UI's certified tier is
 * a display rule that also admits validated legacy rows without a schema
 * version, which `strictV2` excludes.
 */
export const POWER_VALIDITY_FILTERS = ['1', '0', 'any', 'strictV2'] as const;
export type PowerValidityFilter = (typeof POWER_VALIDITY_FILTERS)[number];

/** Absent param means no filtering; unknown values return undefined so the caller can 400. */
export function parsePowerValidityFilter(raw: string | null): PowerValidityFilter | undefined {
  if (raw === null) return 'any';
  return (POWER_VALIDITY_FILTERS as readonly string[]).includes(raw)
    ? (raw as PowerValidityFilter)
    : undefined;
}

/**
 * Pure post-cache row filter. Rows without `metrics` or without a
 * `power_valid` verdict (legacy rows) match only `any`.
 */
export function filterByPowerValidity<T extends { metrics?: Record<string, unknown> }>(
  rows: readonly T[],
  filter: PowerValidityFilter,
): T[] {
  if (filter === 'any') return [...rows];
  return rows.filter((row) => {
    const powerValid = row.metrics?.power_valid;
    if (filter === '1') return powerValid === 1;
    if (filter === '0') return powerValid === 0;
    return powerValid === 1 && row.metrics?.power_metric_schema_version === 2;
  });
}
