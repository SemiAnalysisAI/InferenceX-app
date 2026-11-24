import {
  POWERX_ROLES,
  powerXRolePools,
  resolvePowerXRole,
  rewriteLegacyPowerRoleParams,
  type PowerXRole,
} from '@/components/inference/powerx/powerx-role';
import type { InferenceData, PowerCompare } from '@/components/inference/types';
import { expandPowerCompareSeries } from '@/components/inference/utils/power-compare';

import { ViewsApiParamError } from './errors';
import { parseEnumParam } from './params';

/**
 * The PowerX GPU role control (`i_role`) for the views API: the same pure transforms the
 * page runs, so `/api/v1/views/inference?role=` and the chart draw the same points.
 */

export interface PowerRoleSelection {
  /** Metric config key the series plots under the role. */
  readonly metric: string;
  readonly compare: PowerCompare;
  readonly role: PowerXRole;
}

/**
 * Parse `role` and fold old role encodings onto it: a role-specific metric
 * (`y_measuredPrefillAvgPower`, …) becomes the role-free metric plus its role, and an
 * explicit `role` wins over the one an old metric implied. Roles other than `all` pin the
 * metric the page pins (Energy: GPU-only J per output token, or J per input token for
 * prefill + Input; Power draw: average W per GPU or per-pool % of TDP) and need an Energy
 * or Power draw metric; anything else is a 400.
 */
export function resolvePowerRoleParams(
  metricConfigKey: string,
  roleParam: string | null,
): PowerRoleSelection {
  const explicit = roleParam ? parseEnumParam(roleParam, 'role', POWERX_ROLES, 'all') : null;
  const legacy = rewriteLegacyPowerRoleParams({
    metric: metricConfigKey,
    compare: null,
    role: explicit,
  });
  const metric = legacy.metric ?? metricConfigKey;
  const role = (legacy.role ?? 'all') as PowerXRole;
  const resolved = resolvePowerXRole({ metric, compare: 'none' }, role);
  if (role !== 'all' && resolved.compare !== 'roles')
    throw new ViewsApiParamError(
      'role',
      `role=${role} needs a measured energy (J per token / query) or power draw metric; got ${metric}. ` +
        'Use /api/v1/gpu-metrics-point/stats?role= for Over time load swings.',
    );
  return { metric: resolved.metric, compare: resolved.compare, role };
}

/** The GPU pool a role variant draws, or null for the base all-GPU point. */
export function pointPowerRole(
  point: Pick<InferenceData, 'powerVariant'>,
): 'prefill' | 'decode' | null {
  const id = point.powerVariant?.kind === 'role' ? point.powerVariant.id : null;
  return id === 'prefill' || id === 'decode' ? id : null;
}

/**
 * The points a role draws: `expandPowerCompareSeries` clones each disaggregated row per
 * pool, then only the role's pools are kept (prefill, decode, or both for `split`). `all`
 * returns the points unchanged. Rows with no measured value for any of the role's pools
 * (aggregated serving: every GPU does both) draw nothing and are returned in `aggregated`.
 */
export function powerRolePoints(
  points: readonly InferenceData[],
  selection: Pick<PowerRoleSelection, 'metric' | 'compare' | 'role'>,
): { points: InferenceData[]; aggregated: InferenceData[] } {
  if (selection.role === 'all') return { points: [...points], aggregated: [] };
  const pools = new Set<string>(powerXRolePools(selection.role));
  const keep = (point: InferenceData) => {
    const pool = pointPowerRole(point);
    return pool !== null && pools.has(pool);
  };
  const kept: InferenceData[] = [];
  const aggregated: InferenceData[] = [];
  for (const point of points) {
    const variants = expandPowerCompareSeries([point], selection.metric, selection.compare).filter(
      keep,
    );
    if (variants.length === 0) aggregated.push(point);
    else kept.push(...variants);
  }
  return { points: kept, aggregated };
}
