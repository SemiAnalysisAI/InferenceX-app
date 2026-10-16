// SPDX-License-Identifier: GPL-3.0-only
/** Fan power interface evaluated at each system's thermal load. */

import {
  type Details,
  FrozenModel,
  PowerComponentBreakdown,
  type Provenance,
  validate_watts,
} from '../../../base';
import { FAN_INPUT } from '../profiles';

export abstract class FanPower extends FrozenModel {
  static override readonly typeName: string = 'FanPower';
  readonly provenance: Provenance;

  constructor({ provenance = FAN_INPUT }: { provenance?: Provenance } = {}) {
    super();
    this.provenance = provenance;
  }

  /** Return fan watts for one system, excluding the fans from its own input. */
  abstract estimate_w(non_fan_power_w: number): number;

  estimate_breakdown(non_fan_power_w: number): PowerComponentBreakdown {
    const load = validate_watts(non_fan_power_w);
    return new PowerComponentBreakdown({
      name: 'FanPower',
      power_w: this.estimate_w(load),
      provenance: this.provenance,
      details: [
        ['model', this.typeName],
        ['non_fan_power_w_per_system', load],
        ...this._details(load),
      ],
    });
  }

  protected _details(_non_fan_power_w: number): Details {
    return [];
  }

  protected fields(): Record<string, unknown> {
    return { provenance: this.provenance };
  }
}
