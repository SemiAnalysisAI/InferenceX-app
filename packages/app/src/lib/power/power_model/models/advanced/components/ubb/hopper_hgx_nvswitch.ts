// SPDX-License-Identifier: GPL-3.0-only

import { type Details, type Provenance, ValidationError } from '../../../../base';
import { HOPPER_NVSWITCH_BASELINE } from '../../profiles';
import { FixedPowerComponent } from '../base';

export class HopperHGXNVSwitch extends FixedPowerComponent {
  static override readonly typeName: string = 'HopperHGXNVSwitch';
  static readonly bandwidth_tbps = 12.8;

  constructor({
    power_w = 100,
    provenance = HOPPER_NVSWITCH_BASELINE,
  }: { power_w?: number; provenance?: Provenance } = {}) {
    super({ power_w, provenance });
    if (this.power_w !== 100) {
      throw new ValidationError('Hopper HGX NVSwitch power must be 100 W in model version 0.1');
    }
  }

  protected override _details(): Details {
    return [
      ['bandwidth_tbps', HopperHGXNVSwitch.bandwidth_tbps],
      ['per_switch_power_w', this.power_w],
    ];
  }
}
