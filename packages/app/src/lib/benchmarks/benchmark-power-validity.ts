export const POWER_VALIDITY_FILTERS = ['strictV2'] as const;
export type PowerValidityFilter = (typeof POWER_VALIDITY_FILTERS)[number];

export function parsePowerValidityFilter(
  raw: string | null,
): PowerValidityFilter | null | undefined {
  return raw === null || raw === 'strictV2' ? raw : undefined;
}

export function filterByPowerValidity<T extends { metrics?: Record<string, unknown> }>(
  rows: readonly T[],
  filter: PowerValidityFilter | null,
): T[] {
  if (filter === null) return [...rows];
  return rows.filter(
    (row) => row.metrics?.power_valid === 1 && row.metrics?.power_metric_schema_version === 2,
  );
}
