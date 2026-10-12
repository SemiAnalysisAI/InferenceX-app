// SPDX-License-Identifier: GPL-3.0-only
/** Air-load fan control and coupled cooling/conversion calculation. */

import {
  FrozenModel,
  PowerComponentBreakdown,
  Provenance,
  validate_count,
  validate_watts,
  ValidationError,
  ValueError,
} from '../../../base';

const fraction = (value: number): number => {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new ValidationError('Input should be between 0 and 1');
  }
  return value;
};

const RACK_AIR_COOLING = new Provenance({
  profile_id: 'rack-air-cooling',
  version: '1',
  kind: 'estimated',
  source: 'Engineering fan policy; Sanyo Denki 9CRH0412P5J001 rated input reference',
  input_boundary: 'Complete fan module DC input, including both rotors where applicable',
  assumptions: [
    '30.24 W module is a representative part, not a verified OEM fan SKU.',
    'Linear air-heat-to-speed policy, 40-80% RPM and cubic electrical-power approximation.',
    'Speed fraction is not PWM duty; thermal anchors and fan counts are assumptions.',
  ],
});

export interface RackFanAssemblyFields {
  fan_count: number;
  rated_power_w_per_fan?: number;
  minimum_speed_fraction?: number;
  maximum_speed_fraction?: number;
  design_air_heat_w?: number;
  provenance?: Provenance;
}

export class RackFanAssembly extends FrozenModel {
  static override readonly typeName: string = 'RackFanAssembly';
  readonly fan_count: number;
  readonly rated_power_w_per_fan: number;
  readonly minimum_speed_fraction: number;
  readonly maximum_speed_fraction: number;
  readonly design_air_heat_w: number;
  readonly provenance: Provenance;

  constructor({
    fan_count,
    rated_power_w_per_fan = 30.24,
    minimum_speed_fraction = 0.4,
    maximum_speed_fraction = 0.8,
    design_air_heat_w = 500,
    provenance = RACK_AIR_COOLING,
  }: RackFanAssemblyFields) {
    super();
    this.fan_count = validate_count(fan_count);
    this.rated_power_w_per_fan = validate_watts(rated_power_w_per_fan);
    this.minimum_speed_fraction = fraction(minimum_speed_fraction);
    this.maximum_speed_fraction = fraction(maximum_speed_fraction);
    if (!Number.isFinite(design_air_heat_w) || !(design_air_heat_w > 0)) {
      throw new ValidationError('Input should be greater than 0');
    }
    this.design_air_heat_w = design_air_heat_w;
    this.provenance = provenance;
    if (this.minimum_speed_fraction > this.maximum_speed_fraction) {
      throw new ValidationError('Minimum fan speed must not exceed maximum fan speed');
    }
  }

  estimate_breakdown(air_heat_w: number): PowerComponentBreakdown {
    const heat = validate_watts(air_heat_w);
    const speed =
      this.minimum_speed_fraction +
      (this.maximum_speed_fraction - this.minimum_speed_fraction) *
        Math.min(heat / this.design_air_heat_w, 1);
    return new PowerComponentBreakdown({
      name: 'Fan module',
      quantity: this.fan_count,
      power_w: validate_watts(this.fan_count * this.rated_power_w_per_fan * speed ** 3),
      provenance: this.provenance,
      details: [
        ['speed_fraction', speed],
        ['air_heat_w', heat],
        ['rated_power_w_per_fan', this.rated_power_w_per_fan],
        ['design_air_heat_w', this.design_air_heat_w],
      ],
    });
  }

  protected fields() {
    return {
      fan_count: this.fan_count,
      rated_power_w_per_fan: this.rated_power_w_per_fan,
      minimum_speed_fraction: this.minimum_speed_fraction,
      maximum_speed_fraction: this.maximum_speed_fraction,
      design_air_heat_w: this.design_air_heat_w,
      provenance: this.provenance,
    };
  }
}

/** Include air-cooled conversion loss without counting liquid-cooled chip heat. */
export function solve_cooling(
  component_power_w: number,
  air_heat_w: number,
  fans: RackFanAssembly,
  conversion_loss: (output_w: number) => number,
): PowerComponentBreakdown {
  const load = validate_watts(component_power_w);
  const air = validate_watts(air_heat_w);
  let fan = fans.estimate_breakdown(air);
  for (let iteration = 0; iteration < 128; iteration++) {
    const loss = validate_watts(conversion_loss(validate_watts(load + fan.power_w)));
    const updated = fans.estimate_breakdown(validate_watts(air + loss));
    if (Math.abs(updated.power_w - fan.power_w) < 1e-8) return updated;
    fan = updated;
  }
  throw new ValueError('Fan and conversion-loss iteration did not converge');
}
