import { isPositive } from '@/lib/power/power-basis';

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
  prefill: number;
  decode: number;
  total: number;
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
