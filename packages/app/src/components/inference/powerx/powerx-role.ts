import {
  energyPerFor,
  POWER_PERCENT_TDP_METRIC,
  powerXShowAsFor,
  powerXViewFor,
  WHERE_COMPARE,
  type PowerXSelection,
  type PowerXView,
} from './powerx-views';

/**
 * The PowerX GPU role control (`i_role`): every GPU of a deployment, only the prefill or
 * only the decode GPUs of disaggregated runs, or both pools side by side.
 */
export type PowerXRole = 'all' | 'prefill' | 'decode' | 'split';
export const POWERX_ROLES = [
  'all',
  'prefill',
  'decode',
  'split',
] as const satisfies readonly PowerXRole[];

export function parsePowerXRole(value: string | null | undefined): PowerXRole {
  return value === 'prefill' || value === 'decode' || value === 'split' ? value : 'all';
}

/** Which measured GPU pools a role draws: prefill, decode, or both. */
export function powerXRolePools(role: PowerXRole): readonly ('prefill' | 'decode')[] {
  if (role === 'prefill') return ['prefill'];
  if (role === 'decode') return ['decode'];
  return role === 'split' ? ['prefill', 'decode'] : [];
}

export interface PowerXRoleParams {
  metric: string | null | undefined;
  compare: string | null | undefined;
  role: string | null | undefined;
}

/**
 * Old share links that encoded a GPU role in `i_metric` or `i_pcompare`, rewritten onto
 * `i_role` with the role-free metric. `i_pcompare=roles` was the Where view's Split by
 * role, so it keeps that view (`breakdown`) split by role. Params that carry no role pass
 * through unchanged; an explicit `i_role` wins over the role an old metric implied.
 */
const LEGACY_ROLE_METRICS: Record<string, { metric: string; role: PowerXRole }> = {
  y_measuredPrefillAvgPower: { metric: 'y_measuredAvgPower', role: 'prefill' },
  y_measuredDecodeAvgPower: { metric: 'y_measuredAvgPower', role: 'decode' },
  y_measuredPrefillJPerInputToken: { metric: 'y_measuredJPerInputToken', role: 'prefill' },
  y_measuredDecodeJPerOutputToken: { metric: 'y_measuredJPerOutputToken', role: 'decode' },
};

export function rewriteLegacyPowerRoleParams(params: PowerXRoleParams): PowerXRoleParams {
  let { metric, compare, role } = params;
  const legacy = metric ? LEGACY_ROLE_METRICS[metric] : undefined;
  if (legacy) {
    metric = legacy.metric;
    role ||= legacy.role;
  }
  if (compare === 'roles') {
    compare = WHERE_COMPARE;
    role ||= 'split';
  }
  return { metric, compare, role };
}

/**
 * The metric + compare pair the chart draws under a role. The user's stored choice stays
 * untouched so it comes back with All GPUs:
 * - Energy: GPU only, J per output token (the denominator prefill and decode share), or
 *   J per input token for the prefill GPUs when Per is Input; rated boundaries off.
 * - Power draw: GPU only, average W per GPU (or % of TDP per pool); percentiles need the
 *   whole fleet, so P75 / P90 fall back to the average.
 * - Where and Over time keep their own selection and split their layers or lanes.
 */
export function resolvePowerXRole(selection: PowerXSelection, role: PowerXRole): PowerXSelection {
  if (role === 'all') return selection;
  const view = powerXViewFor(selection.metric, selection.compare);
  if (view === 'energy') {
    const input = role === 'prefill' && energyPerFor(selection.metric) === 'input';
    return {
      metric: input ? 'y_measuredJPerInputToken' : 'y_measuredJPerOutputToken',
      compare: 'roles',
    };
  }
  if (view === 'draw') {
    return {
      metric:
        powerXShowAsFor(selection.metric) === 'tdp'
          ? POWER_PERCENT_TDP_METRIC
          : 'y_measuredAvgPower',
      compare: 'roles',
    };
  }
  return selection;
}

/** Controls a GPU role pins, so the view can say why each one cannot change. */
export type PowerXPinnedControl = 'count' | 'per' | 'rated' | 'statistic' | 'headroom';

export function powerXPinnedControls(
  view: PowerXView | null,
  role: PowerXRole,
): readonly PowerXPinnedControl[] {
  if (role === 'all') return [];
  if (view === 'energy') return role === 'prefill' ? ['count', 'rated'] : ['count', 'per', 'rated'];
  if (view === 'draw') return ['count', 'statistic', 'headroom'];
  return [];
}

/** Per units a role allows on the Energy view: prefill adds its role-local Input. */
export function powerXRoleEnergyPers(role: PowerXRole): readonly ('output' | 'input')[] {
  return role === 'prefill' ? ['output', 'input'] : ['output'];
}

export interface PowerXRolePoint {
  disagg?: boolean;
  measuredPrefillAvgPower?: { y: number } | null;
  measuredDecodeAvgPower?: { y: number } | null;
}

/** True when a row carries measured power for at least one GPU pool. */
export function hasPowerRoleData(point: PowerXRolePoint): boolean {
  return Boolean(
    point.disagg &&
    (Number.isFinite(point.measuredPrefillAvgPower?.y) ||
      Number.isFinite(point.measuredDecodeAvgPower?.y)),
  );
}

/**
 * Series keys (`powerVariantId`) a role hides on a chart drawn with `roles` compare: the
 * base all-GPU line ('') and every pool the role does not read. All GPUs hides nothing.
 */
export function powerRoleHiddenVariants(role: PowerXRole): ReadonlySet<string> {
  if (role === 'all') return new Set();
  const shown = new Set<string>(powerXRolePools(role));
  return new Set(['', 'all', 'prefill', 'decode'].filter((id) => !shown.has(id)));
}

/**
 * The rows a table or export lists under a role: each disaggregated row once per pool the
 * role reads, and aggregated rows once (they cannot split, so they read "aggregated").
 */
export function powerRoleTableRows<
  T extends { powerVariant?: { kind: string; id: string } } & PowerXRolePoint,
>(rows: readonly T[], role: PowerXRole): T[] {
  if (role === 'all') return rows.filter((row) => row.powerVariant?.kind !== 'role');
  const hidden = powerRoleHiddenVariants(role);
  return rows.filter((row) => {
    if (row.powerVariant?.kind === 'role') return !hidden.has(row.powerVariant.id);
    return !row.powerVariant && !hasPowerRoleData(row);
  });
}
