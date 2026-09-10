import { at, entries, number, rows, text, type Json } from './bundle';

/** Compare measured board watts only with the same devices' recorded enforced limits. */
export function powerLimitComparison(
  phase: Json,
  before: Json,
  after: Json,
  gpuUuids: Json,
  powerUnit: Json,
): { watts: number; percent: number } | null {
  const uuids = rows(gpuUuids).map(text);
  const mean = number(at(phase, 'aggregate', 'avg_power_w'));
  const start = Date.parse(text(at(before, 'observed_at')));
  const end = Date.parse(text(at(after, 'observed_at')));
  if (
    at(phase, 'valid') !== true ||
    powerUnit !== 'W' ||
    mean === null ||
    mean < 0 ||
    uuids.length === 0 ||
    uuids.some((uuid) => !uuid) ||
    new Set(uuids).size !== uuids.length ||
    at(before, 'status') !== 'recorded' ||
    at(after, 'status') !== 'recorded' ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end < start
  )
    return null;
  const snapshots = [before, after].map((snapshot) => rows(at(snapshot, 'gpus')));
  if (
    snapshots.some((devices) => {
      const ids = devices.map((device) => text(at(device, 'uuid')));
      return (
        ids.length !== uuids.length ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !uuids.includes(id))
      );
    })
  )
    return null;
  const measurements = entries(at(phase, 'per_gpu'));
  if (measurements.length !== uuids.length || measurements.some(([id]) => !uuids.includes(id)))
    return null;
  let watts = 0;
  let boardMean = 0;
  for (const uuid of uuids) {
    const first = snapshots[0].find((device) => at(device, 'uuid') === uuid);
    const last = snapshots[1].find((device) => at(device, 'uuid') === uuid);
    for (const key of ['configured_limit_w', 'enforced_limit_w']) {
      const limit = number(at(first, key));
      if (limit === null || limit <= 0 || limit !== number(at(last, key))) return null;
    }
    const measured = number(at(phase, 'per_gpu', uuid, 'avg_power_w'));
    if (measured === null || measured < 0) return null;
    watts += number(at(first, 'enforced_limit_w'))!;
    boardMean += measured;
  }
  // Reject a partial or mismatched aggregate instead of silently normalizing it.
  if (!Number.isFinite(watts) || Math.abs(boardMean - mean) > Math.max(1, mean) * 1e-6) return null;
  const percent = (mean / watts) * 100;
  return Number.isFinite(percent) ? { watts, percent } : null;
}
