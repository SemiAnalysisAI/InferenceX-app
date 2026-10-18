// SPDX-License-Identifier: GPL-3.0-only
/* oxlint-disable max-classes-per-file -- mirrors the upstream Python module, class for class */
/** Reusable component interfaces and explicit equipment quantities. */

import {
  type Details,
  FrozenModel,
  PowerComponentBreakdown,
  type Provenance,
  validate_count,
  validate_watts,
} from '../../../base';
import { COMPONENT_INPUT } from '../profiles';

export interface GenericComponentFields {
  provenance?: Provenance;
}

export abstract class GenericComponent extends FrozenModel {
  static override readonly typeName: string = 'GenericComponent';
  readonly provenance: Provenance;

  constructor({ provenance = COMPONENT_INPUT }: GenericComponentFields = {}) {
    super();
    this.provenance = provenance;
  }

  /** Return electrical watts for one component in its configured state. */
  abstract estimate_w(): number;

  protected _details(): Details {
    return [];
  }

  estimate_breakdown(): PowerComponentBreakdown {
    return new PowerComponentBreakdown({
      name: this.typeName,
      power_w: this.estimate_w(),
      provenance: this.provenance,
      details: this._details(),
    });
  }

  protected fields(): Record<string, unknown> {
    return { provenance: this.provenance };
  }
}

export interface FixedPowerComponentFields extends GenericComponentFields {
  power_w: number;
}

/** An explicitly supplied power input, also usable for additional component types. */
export class FixedPowerComponent extends GenericComponent {
  static override readonly typeName: string = 'FixedPowerComponent';
  readonly power_w: number;

  constructor({ power_w, ...fields }: FixedPowerComponentFields) {
    super(fields);
    this.power_w = validate_watts(power_w);
  }

  estimate_w(): number {
    return this.power_w;
  }

  protected override fields(): Record<string, unknown> {
    return { ...super.fields(), power_w: this.power_w };
  }
}

export class ComponentGroup extends FrozenModel {
  static override readonly typeName: string = 'ComponentGroup';
  readonly component: GenericComponent;
  readonly quantity: number;

  constructor({ component, quantity = 1 }: { component: GenericComponent; quantity?: number }) {
    super();
    this.component = component;
    this.quantity = validate_count(quantity);
  }

  estimate_breakdown(): PowerComponentBreakdown {
    return this.component.estimate_breakdown().scaled(this.quantity);
  }

  protected fields() {
    return { component: this.component, quantity: this.quantity };
  }
}
