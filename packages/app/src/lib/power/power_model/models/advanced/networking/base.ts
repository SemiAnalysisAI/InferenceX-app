// SPDX-License-Identifier: GPL-3.0-only
/* oxlint-disable max-classes-per-file -- mirrors the upstream Python module, class for class */

import {
  DEFAULT_OPERATING_STATE,
  type Details,
  FrozenModel,
  type OperatingState,
  PowerComponentBreakdown,
  type Provenance,
  validate_count,
  validate_quantity,
  validate_watts,
  ValidationError,
} from '../../../base';
import { COMPONENT_INPUT } from '../profiles';

export interface ScaleOutNetworkingGearFields {
  name: string;
  power_w: number;
  provenance?: Provenance;
}

export abstract class ScaleOutNetworkingGear extends FrozenModel {
  static override readonly typeName: string = 'ScaleOutNetworkingGear';
  readonly name: string;
  readonly power_w: number;
  readonly provenance: Provenance;

  constructor({ name, power_w, provenance = COMPONENT_INPUT }: ScaleOutNetworkingGearFields) {
    super();
    if (typeof name !== 'string' || name.length === 0) {
      throw new ValidationError('String should have at least 1 character');
    }
    this.name = name;
    this.power_w = validate_watts(power_w);
    this.provenance = provenance;
  }

  abstract for_operating_state(state: OperatingState): ScaleOutNetworkingGear;

  abstract estimate_breakdown(): PowerComponentBreakdown;

  protected fields(): Record<string, unknown> {
    return { name: this.name, power_w: this.power_w, provenance: this.provenance };
  }
}

export class NetworkGroup extends FrozenModel {
  static override readonly typeName: string = 'NetworkGroup';
  readonly gear: ScaleOutNetworkingGear;
  readonly quantity: number;
  readonly details: Details;

  constructor({
    gear,
    quantity = 1,
    details = [],
  }: {
    gear: ScaleOutNetworkingGear;
    quantity?: number;
    details?: Details;
  }) {
    super();
    this.gear = gear;
    this.quantity = validate_quantity(quantity);
    this.details = details;
  }

  scaled(count: number): NetworkGroup {
    const systems = validate_count(count);
    return new NetworkGroup({
      gear: this.gear,
      quantity: this.quantity * systems,
      details: this.details,
    });
  }

  estimate_breakdown({
    operating_state = DEFAULT_OPERATING_STATE,
  }: { operating_state?: OperatingState } = {}): PowerComponentBreakdown {
    const result = this.gear
      .for_operating_state(operating_state)
      .estimate_breakdown()
      .scaled(this.quantity);
    return new PowerComponentBreakdown({
      name: result.name,
      power_w: result.power_w,
      quantity: result.quantity,
      children: result.children,
      provenance: result.provenance,
      details: [...result.details, ...this.details],
      configuration: result.configuration,
    });
  }

  protected fields() {
    return { gear: this.gear, quantity: this.quantity, details: this.details };
  }
}
