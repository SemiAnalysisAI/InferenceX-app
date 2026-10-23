// SPDX-License-Identifier: GPL-3.0-only
/* oxlint-disable max-classes-per-file -- mirrors the upstream Python module, class for class */

import {
  type Details,
  FrozenModel,
  model_validator,
  Provenance,
  sum_watts,
  validate_count,
  validate_watts,
  ValidationError,
} from '../../../base';
import { FanPower } from './fan';

const fraction = (value: number, { positive = false } = {}): number => {
  if (!Number.isFinite(value) || value > 1 || (positive ? !(value > 0) : !(value >= 0))) {
    throw new ValidationError(
      positive ? 'Input should be greater than 0 and at most 1' : 'Input should be between 0 and 1',
    );
  }
  return value;
};

const positiveValue = (value: number): number => {
  if (!Number.isFinite(value) || !(value > 0)) {
    throw new ValidationError('Input should be greater than 0');
  }
  return value;
};

export const HGX_FAN_BASELINE = new Provenance({
  profile_id: 'normalized-hgx-fans',
  version: '1',
  source: 'User-specified GPU TDPs and shared cooling-policy assumptions',
  kind: 'assumed',
  input_boundary: 'Chassis fan DC watts from pre-fan component DC load; excludes PSU loss and PUE',
  assumptions: [
    'Default GPU TDP per device: Hopper 700 W, B200 1000 W, B300 1200 W, ' +
      'MI300 750 W, MI325 1000 W, MI355 1400 W.',
    'Design heat is GPU count times GPU TDP plus the highest modeled non-GPU power: ' +
      'CPU offloading and active scale-out networking, including board NICs and optional extras.',
    'All default HGX systems share 22-80% PWM and load-to-PWM exponent 1.0.',
    'Fan watts at design heat use one shared ratio: 1100 * 0.8**3 / 9500, ' +
      'approximately 5.93%; the effective nameplate is derived from that ratio.',
    'This is a shared comparison baseline, not a measured chassis fan profile.',
  ],
});

export interface AffinityFanPowerFields {
  electrical_nameplate_w: number;
  min_pwm_frac: number;
  normal_max_pwm_frac: number;
  full_cooling_load_w: number;
  fan_curve_exponent: number;
  fan_complement?: string;
  provenance?: Provenance;
}

export class AffinityFanPower extends FanPower {
  static override readonly typeName: string = 'AffinityFanPower';
  readonly electrical_nameplate_w: number;
  readonly min_pwm_frac: number;
  readonly normal_max_pwm_frac: number;
  readonly full_cooling_load_w: number;
  readonly fan_curve_exponent: number;
  readonly fan_complement: string;

  constructor({
    provenance,
    fan_complement = 'Effective aggregate fan electrical nameplate',
    ...fields
  }: AffinityFanPowerFields) {
    super({ provenance });
    this.electrical_nameplate_w = validate_watts(fields.electrical_nameplate_w);
    this.min_pwm_frac = fraction(fields.min_pwm_frac);
    this.normal_max_pwm_frac = fraction(fields.normal_max_pwm_frac, { positive: true });
    this.full_cooling_load_w = positiveValue(fields.full_cooling_load_w);
    this.fan_curve_exponent = positiveValue(fields.fan_curve_exponent);
    this.fan_complement = fan_complement;
    if (this.min_pwm_frac > this.normal_max_pwm_frac) {
      throw new ValidationError('Minimum fan PWM must not exceed normal maximum PWM');
    }
  }

  _pwm(load: number): number {
    const cooling = Math.min(1, load / this.full_cooling_load_w);
    const pwm =
      this.min_pwm_frac +
      (this.normal_max_pwm_frac - this.min_pwm_frac) * cooling ** this.fan_curve_exponent;
    return Math.min(this.normal_max_pwm_frac, Math.max(this.min_pwm_frac, pwm));
  }

  estimate_w(non_fan_power_w: number): number {
    const pwm = this._pwm(validate_watts(non_fan_power_w));
    return validate_watts(this.electrical_nameplate_w * pwm ** 3);
  }

  override _details(non_fan_power_w: number): Details {
    const pwm = this._pwm(non_fan_power_w);
    return [
      ['mode', 'thermal_load_curve'],
      ['fan_pwm_fraction', pwm],
      ['electrical_nameplate_w', this.electrical_nameplate_w],
      ['fan_complement', this.fan_complement],
      ['cooling_load_fraction', Math.min(1, non_fan_power_w / this.full_cooling_load_w)],
    ];
  }

  protected override fields(): Record<string, unknown> {
    return {
      ...super.fields(),
      electrical_nameplate_w: this.electrical_nameplate_w,
      min_pwm_frac: this.min_pwm_frac,
      normal_max_pwm_frac: this.normal_max_pwm_frac,
      full_cooling_load_w: this.full_cooling_load_w,
      fan_curve_exponent: this.fan_curve_exponent,
      fan_complement: this.fan_complement,
    };
  }
}

export interface HGXFanPolicyFields {
  min_pwm_frac?: number;
  normal_max_pwm_frac?: number;
  fan_curve_exponent?: number;
  fan_power_ratio_at_design?: number;
}

export class HGXFanPolicy extends FrozenModel {
  static override readonly typeName: string = 'HGXFanPolicy';
  readonly min_pwm_frac: number;
  readonly normal_max_pwm_frac: number;
  readonly fan_curve_exponent: number;
  readonly fan_power_ratio_at_design: number;

  constructor({
    min_pwm_frac = 0.22,
    normal_max_pwm_frac = 0.8,
    fan_curve_exponent = 1,
    fan_power_ratio_at_design = (1100 * 0.8 ** 3) / 9500,
  }: HGXFanPolicyFields = {}) {
    super();
    this.min_pwm_frac = fraction(min_pwm_frac);
    this.normal_max_pwm_frac = fraction(normal_max_pwm_frac, { positive: true });
    this.fan_curve_exponent = positiveValue(fan_curve_exponent);
    this.fan_power_ratio_at_design = fraction(fan_power_ratio_at_design, { positive: true });
    if (this.min_pwm_frac > this.normal_max_pwm_frac) {
      throw new ValidationError('Minimum fan PWM must not exceed normal maximum PWM');
    }
  }

  protected fields() {
    return {
      min_pwm_frac: this.min_pwm_frac,
      normal_max_pwm_frac: this.normal_max_pwm_frac,
      fan_curve_exponent: this.fan_curve_exponent,
      fan_power_ratio_at_design: this.fan_power_ratio_at_design,
    };
  }
}

export interface NormalizedHGXFanPowerFields {
  gpu_tdp_w: number;
  gpu_count: number;
  design_non_gpu_power_w: number;
  policy?: HGXFanPolicy;
  provenance?: Provenance;
}

export class NormalizedHGXFanPower extends FanPower {
  static override readonly typeName: string = 'NormalizedHGXFanPower';
  readonly gpu_tdp_w: number;
  readonly gpu_count: number;
  readonly design_non_gpu_power_w: number;
  readonly policy: HGXFanPolicy;

  constructor({
    gpu_tdp_w,
    gpu_count,
    design_non_gpu_power_w,
    policy = new HGXFanPolicy(),
    provenance = HGX_FAN_BASELINE,
  }: NormalizedHGXFanPowerFields) {
    super({ provenance });
    this.gpu_tdp_w = positiveValue(gpu_tdp_w);
    this.gpu_count = validate_count(gpu_count);
    this.design_non_gpu_power_w = validate_watts(design_non_gpu_power_w);
    this.policy = policy;
    model_validator(() => validate_watts(this.electrical_nameplate_w));
  }

  get full_cooling_load_w(): number {
    return sum_watts([this.gpu_count * this.gpu_tdp_w, this.design_non_gpu_power_w]);
  }

  get electrical_nameplate_w(): number {
    return validate_watts(
      (this.full_cooling_load_w * this.policy.fan_power_ratio_at_design) /
        this.policy.normal_max_pwm_frac ** 3,
    );
  }

  get affinity_curve(): AffinityFanPower {
    return new AffinityFanPower({
      electrical_nameplate_w: this.electrical_nameplate_w,
      full_cooling_load_w: this.full_cooling_load_w,
      min_pwm_frac: this.policy.min_pwm_frac,
      normal_max_pwm_frac: this.policy.normal_max_pwm_frac,
      fan_curve_exponent: this.policy.fan_curve_exponent,
      fan_complement: 'Normalized capacity sized from GPU TDP and host design watts',
      provenance: this.provenance,
    });
  }

  estimate_w(non_fan_power_w: number): number {
    return this.affinity_curve.estimate_w(non_fan_power_w);
  }

  protected override _details(non_fan_power_w: number): Details {
    return [
      ...this.affinity_curve._details(non_fan_power_w),
      ['gpu_tdp_w', this.gpu_tdp_w],
      ['gpu_count_per_system', this.gpu_count],
      ['design_non_gpu_power_w', this.design_non_gpu_power_w],
      ['full_cooling_load_w', this.full_cooling_load_w],
      ['fan_power_ratio_at_design', this.policy.fan_power_ratio_at_design],
      ['min_pwm_frac', this.policy.min_pwm_frac],
      ['normal_max_pwm_frac', this.policy.normal_max_pwm_frac],
      ['fan_curve_exponent', this.policy.fan_curve_exponent],
    ];
  }

  protected override fields(): Record<string, unknown> {
    return {
      ...super.fields(),
      gpu_tdp_w: this.gpu_tdp_w,
      gpu_count: this.gpu_count,
      design_non_gpu_power_w: this.design_non_gpu_power_w,
      policy: this.policy,
      full_cooling_load_w: this.full_cooling_load_w,
      electrical_nameplate_w: this.electrical_nameplate_w,
    };
  }
}
