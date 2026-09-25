import { isPositive } from '@/lib/power-basis';

/**
 * Reconstructs how a disaggregated deployment's request energy splits between
 * its prefill and decode pools (PowerX Figure 7).
 *
 * Schema-2 aggregate energy has one numerator: the deployment's energy over the
 * validated window is divided by input tokens for `joules_per_input_token` and
 * by output tokens for `joules_per_output_token`. Their ratio is therefore the
 * input:output token ratio the benchmark actually served. Multiplying the
 * prefill pool's J per input token by that ratio expresses the prefill energy
 * per output token, on the same axis as the decode pool's J per output token.
 * The two add up to the whole request's J per output token, which equals the
 * deployment figure whenever the role energies partition the deployment energy.
 *
 * Nothing is estimated: every input is a same-window telemetry figure, and the
 * result is `undefined` whenever one is missing, not validated, or not from a
 * disaggregated deployment.
 */
export interface RoleEnergyInput {
  disagg?: boolean;
  power_valid?: number;
  power_metric_schema_version?: number;
  joules_per_input_token?: number;
  joules_per_output_token?: number;
  prefill_joules_per_input_token?: number;
  decode_joules_per_output_token?: number;
}

export interface ReconstructedRoleEnergy {
  /** Prefill pool energy per output token (J). */
  prefill: number;
  /** Decode pool energy per output token (J). */
  decode: number;
  /** Prefill + decode (J per output token). */
  total: number;
  /** Prefill share of the reconstructed total, in percent. */
  prefillShare: number;
}

export function reconstructedRoleEnergy(
  entry: RoleEnergyInput,
): ReconstructedRoleEnergy | undefined {
  if (!entry.disagg || entry.power_valid !== 1 || entry.power_metric_schema_version !== 2) {
    return undefined;
  }
  const input = entry.joules_per_input_token;
  const output = entry.joules_per_output_token;
  const prefill = entry.prefill_joules_per_input_token;
  const decode = entry.decode_joules_per_output_token;
  if (!isPositive(input) || !isPositive(output) || !isPositive(prefill) || !isPositive(decode)) {
    return undefined;
  }
  const prefillPerOutputToken = prefill * (output / input);
  const total = prefillPerOutputToken + decode;
  if (!isPositive(prefillPerOutputToken) || !isPositive(total)) return undefined;
  return {
    prefill: prefillPerOutputToken,
    decode,
    total,
    prefillShare: (100 * prefillPerOutputToken) / total,
  };
}
