// SPDX-License-Identifier: GPL-3.0-only
/** The user-specified Blackwell HGX NVSwitch baseline. */

import { type Details, type Provenance, ValidationError } from '../../../../base';
import { BLACKWELL_NVSWITCH_BASELINE } from '../../profiles';
import { FixedPowerComponent } from '../base';

export class BlackwellHGXNVSwitch extends FixedPowerComponent {
  static override readonly typeName: string = 'BlackwellHGXNVSwitch';
  static readonly bandwidth_tbps = 28.8;

  constructor({
    power_w = 200,
    provenance = BLACKWELL_NVSWITCH_BASELINE,
  }: { power_w?: number; provenance?: Provenance } = {}) {
    super({ power_w, provenance });
    if (this.power_w !== 200) {
      throw new ValidationError('Blackwell HGX NVSwitch power must be 200 W in model version 0.1');
    }
  }

  protected override _details(): Details {
    return [
      ['bandwidth_tbps', BlackwellHGXNVSwitch.bandwidth_tbps],
      ['per_switch_power_w', this.power_w],
    ];
  }
}
