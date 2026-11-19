// SPDX-License-Identifier: GPL-3.0-only
/* oxlint-disable max-classes-per-file -- mirrors the upstream Python module, class for class */

import {
  FrozenModel,
  pairs,
  PowerComponentBreakdown,
  Provenance,
  validate_watts,
  ValidationError,
  ValueError,
} from '../../../base';

const positive = (value: number): number => {
  if (!Number.isFinite(value) || !(value > 0)) {
    throw new ValidationError('Input should be greater than 0');
  }
  return value;
};

export class DCLossPoint extends FrozenModel {
  static override readonly typeName: string = 'DCLossPoint';
  readonly output_fraction: number;
  readonly loss_w: number;

  constructor({ output_fraction, loss_w }: { output_fraction: number; loss_w: number }) {
    super();
    if (!Number.isFinite(output_fraction) || output_fraction < 0 || output_fraction > 1) {
      throw new ValidationError('Input should be between 0 and 1');
    }
    this.output_fraction = output_fraction;
    this.loss_w = validate_watts(loss_w);
  }

  protected fields() {
    return { output_fraction: this.output_fraction, loss_w: this.loss_w };
  }
}

const curve = (points: readonly (readonly [number, number])[]): DCLossPoint[] =>
  points.map(([output_fraction, loss_w]) => new DCLossPoint({ output_fraction, loss_w }));

export interface DCConverterAssemblyFields {
  module_capacity_w?: number;
  input_voltage_v?: number;
  output_voltage_v?: number | null;
  loss_curve?: readonly DCLossPoint[];
  provenance?: Provenance;
}

const RACK_48V_CONVERTER = new Provenance({
  profile_id: 'rack-48v-converter',
  version: '1',
  kind: 'estimated',
  source: 'Engineering curve informed by Infineon REF-IBC-1600W-GAN peak efficiency',
  input_boundary: '48 V-class tray bus to intermediate rails; loss only',
  assumptions: [
    'One 1600 W converter with 5 W enabled no-load loss.',
    'Assumed 94/96/96.7/96% efficiency at 10/20/50/100% output.',
    'Only the reference design peak informs this curve; these are not NVL72 measurements.',
    'All converter losses are assigned to air cooling for the initial comparison.',
  ],
});

export class DCConverterAssembly extends FrozenModel {
  static override readonly typeName: string = 'DCConverterAssembly';
  readonly module_capacity_w: number;
  readonly input_voltage_v: number;
  readonly output_voltage_v: number | null;
  readonly loss_curve: readonly DCLossPoint[];
  readonly provenance: Provenance;

  constructor({
    module_capacity_w = 1600,
    input_voltage_v = 50,
    output_voltage_v = 12,
    loss_curve = curve([
      [0, 5],
      [0.1, 160 / 0.94 - 160],
      [0.2, 320 / 0.96 - 320],
      [0.5, 800 / 0.967 - 800],
      [1, 1600 / 0.96 - 1600],
    ]),
    provenance = RACK_48V_CONVERTER,
  }: DCConverterAssemblyFields = {}) {
    super();
    this.module_capacity_w = positive(module_capacity_w);
    this.input_voltage_v = positive(input_voltage_v);
    this.output_voltage_v = output_voltage_v === null ? null : positive(output_voltage_v);
    if (loss_curve.length < 2) {
      throw new ValidationError('Tuple should have at least 2 items after validation');
    }
    this.loss_curve = loss_curve;
    this.provenance = provenance;
    if (loss_curve[0].output_fraction !== 0 || loss_curve.at(-1)!.output_fraction !== 1) {
      throw new ValidationError('DC loss curve must span zero through full output');
    }
    for (const [left, right] of pairs(loss_curve)) {
      if (left.output_fraction >= right.output_fraction || left.loss_w > right.loss_w) {
        throw new ValidationError('DC loss curve requires increasing load and nondecreasing loss');
      }
    }
  }

  loss_w(output_w: number): number {
    const output = validate_watts(output_w);
    const fraction = output / this.module_capacity_w;
    if (fraction > 1) {
      throw new ValueError('DC converter output exceeds installed continuous capacity');
    }
    for (const [left, right] of pairs(this.loss_curve)) {
      if (fraction <= right.output_fraction) {
        const weight =
          (fraction - left.output_fraction) / (right.output_fraction - left.output_fraction);
        return validate_watts(left.loss_w + weight * (right.loss_w - left.loss_w));
      }
    }
    throw new ValueError('DC converter curve does not cover output');
  }

  estimate_loss_breakdown(output_w: number): PowerComponentBreakdown {
    const loss = this.loss_w(output_w);
    return new PowerComponentBreakdown({
      name: 'DC/DC converter loss',
      power_w: loss,
      provenance: this.provenance,
      details: [
        ['output_power_w', output_w],
        ['input_power_w', output_w + loss],
        ['input_voltage_v', this.input_voltage_v],
        ['module_capacity_w', this.module_capacity_w],
      ],
    });
  }

  protected fields() {
    return {
      module_capacity_w: this.module_capacity_w,
      input_voltage_v: this.input_voltage_v,
      output_voltage_v: this.output_voltage_v,
      loss_curve: this.loss_curve,
      provenance: this.provenance,
    };
  }
}

export function compute_tray_converter(): DCConverterAssembly {
  return new DCConverterAssembly({
    module_capacity_w: 8000,
    loss_curve: curve([
      [0, 25],
      [0.1, 800 / 0.94 - 800],
      [0.2, 1600 / 0.96 - 1600],
      [0.5, 4000 / 0.967 - 4000],
      [1, 8000 / 0.96 - 8000],
    ]),
    provenance: new Provenance({
      profile_id: 'compute-tray-48v-converter',
      version: '2',
      kind: 'estimated',
      source: 'User-specified single tray converter with shared engineering loss curve',
      input_boundary: '48 V-class compute-tray bus to all modeled tray loads; loss only',
      assumptions: [
        'One converter per compute tray supplies both Bianca boards and tray auxiliaries.',
        '8 kW capacity and 25 W enabled no-load loss are provisional whole-unit values.',
        'Assumed 94/96/96.7/96% efficiency at 10/20/50/100% output.',
        'This is an estimated aggregate curve, not a converter internal-module BoM.',
        'Converter loss is assigned to air cooling for the initial comparison.',
      ],
    }),
  });
}
