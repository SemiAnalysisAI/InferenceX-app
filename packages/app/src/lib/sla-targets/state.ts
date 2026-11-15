import { SLA_EXAMPLE_TARGETS, type SlaTargets } from '@semianalysisai/inferencex-constants';

import { SLA_MAX_TARGET_MS } from './evaluation';

export type SlaCostTier = 'hyperscaler' | 'rental';

export interface SlaTargetsState {
  /** `null` until the dataset resolves a default. */
  model: string | null;
  /** `null` until the dataset resolves a default. */
  workload: string | null;
  targets: SlaTargets;
  costTier: SlaCostTier;
}

/** Share-link parameters of the SLA Targets page. */
export type SlaTargetsParams = Partial<
  Record<'s_model' | 's_seq' | 's_ttft' | 's_tpot' | 's_e2e' | 's_att' | 's_cost', string>
>;

/** Required attainment is a free value inside this range, in percent. */
export const SLA_ATTAINMENT_PERCENT_RANGE = { min: 50, max: 99.99 } as const;
/** End-to-end target shown when the constraint is first enabled, s. */
export const SLA_DEFAULT_E2E_S = 60;

export const SLA_DEFAULT_STATE: SlaTargetsState = {
  model: null,
  workload: null,
  targets: SLA_EXAMPLE_TARGETS,
  costTier: 'hyperscaler',
};

/**
 * A latency target as typed: any positive number up to the largest the
 * evaluation accepts. `null` for text that is not such a number; the value is
 * never rounded or snapped to a step.
 */
export function parseTargetInput(raw: string | undefined, max: number): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 && value <= max ? value : null;
}

/** Clamp a required attainment in percent to the supported range, at two decimals. */
export function clampAttainmentPercent(percent: number): number {
  const { min, max } = SLA_ATTAINMENT_PERCENT_RANGE;
  if (!Number.isFinite(percent)) return SLA_EXAMPLE_TARGETS.requiredAttainment * 100;
  return Math.round(Math.min(max, Math.max(min, percent)) * 100) / 100;
}

/** A clamped percent as a fraction free of binary noise: 99.99 gives 0.9999, not 0.99989…. */
export function attainmentFraction(percent: number): number {
  return Number((clampAttainmentPercent(percent) / 100).toFixed(6));
}

/** Percent with at most two decimals, without trailing zeros: 99, 99.5, 99.95. */
export function attainmentPercent(fraction: number): number {
  return Math.round(fraction * 10_000) / 100;
}

/**
 * Read the page state from share-link parameters. A latency target that is
 * not a usable number falls back to the example value.
 */
export function parseSlaTargetsState(params: SlaTargetsParams): SlaTargetsState {
  const example = SLA_EXAMPLE_TARGETS;
  const attainment =
    params.s_att === undefined || params.s_att === ''
      ? example.requiredAttainment
      : attainmentFraction(Number(params.s_att));
  return {
    model: params.s_model || null,
    workload: params.s_seq || null,
    targets: {
      maxTtftMs: parseTargetInput(params.s_ttft, SLA_MAX_TARGET_MS) ?? example.maxTtftMs,
      maxTpotMs: parseTargetInput(params.s_tpot, SLA_MAX_TARGET_MS) ?? example.maxTpotMs,
      maxE2eS: parseTargetInput(params.s_e2e, SLA_MAX_TARGET_MS / 1000),
      requiredAttainment: attainment,
    },
    costTier: params.s_cost === 'rental' ? 'rental' : 'hyperscaler',
  };
}

/** Share-link parameters for a state. Values equal to the defaults are written as ''. */
export function serializeSlaTargetsState(state: SlaTargetsState): Required<SlaTargetsParams> {
  const example = SLA_EXAMPLE_TARGETS;
  const { targets } = state;
  return {
    s_model: state.model ?? '',
    s_seq: state.workload ?? '',
    s_ttft: targets.maxTtftMs === example.maxTtftMs ? '' : String(targets.maxTtftMs),
    s_tpot: targets.maxTpotMs === example.maxTpotMs ? '' : String(targets.maxTpotMs),
    s_e2e: targets.maxE2eS === null ? '' : String(targets.maxE2eS),
    s_att:
      targets.requiredAttainment === example.requiredAttainment
        ? ''
        : String(attainmentPercent(targets.requiredAttainment)),
    s_cost: state.costTier === 'rental' ? 'rental' : '',
  };
}
