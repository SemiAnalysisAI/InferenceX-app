/**
 * Certification tier for measured power telemetry on a benchmark entry.
 *
 * - `certified` — the producer (runner's `aggregate_power.py`) explicitly
 *   validated the measurement (`power_valid === 1`) AND the row's unprefixed
 *   joules fields carry whole-deployment semantics (non-disagg rows always do;
 *   disagg rows only under `WHOLE_DEPLOYMENT_ENERGY_SCHEMA_VERSION`, see
 *   `benchmark-transform.ts`).
 * - `legacy` — measured telemetry renders but predates the validation
 *   contract: no verdict at all, or a disagg verdict without the versioned
 *   whole-deployment energy semantics.
 *
 * Absent (`undefined`) means no measured telemetry survives field gating.
 */
export type PowerTier = 'certified' | 'legacy';

/**
 * Resolve the certification tier for one entry's measured power telemetry.
 *
 * Legacy admission is deliberate: historical single-node rows were never run
 * through the producer validator, and hiding them would vanish the bulk of
 * the measured-power dataset. An explicit `power_valid === 0` verdict is
 * authoritative the other way — its telemetry is scrubbed upstream, so the
 * row carries no tier rather than a "legacy" one.
 */
export function resolvePowerTier(args: {
  /** Producer verdict: 1 valid, 0 invalid, undefined for legacy rows. */
  powerValid: number | undefined;
  /**
   * Whether the unprefixed joules fields mean whole-deployment energy
   * (`!disagg || power_metric_schema_version === WHOLE_DEPLOYMENT_ENERGY_SCHEMA_VERSION`).
   */
  wholeDeploymentSemantics: boolean;
  /** Whether any measured power/energy value survives field gating. */
  hasMeasuredTelemetry: boolean;
}): PowerTier | undefined {
  if (!args.hasMeasuredTelemetry || args.powerValid === 0) return undefined;
  return args.powerValid === 1 && args.wholeDeploymentSemantics ? 'certified' : 'legacy';
}
