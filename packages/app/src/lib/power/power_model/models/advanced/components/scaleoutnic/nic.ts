// SPDX-License-Identifier: GPL-3.0-only

import { type Details, type OperatingState, py_repr, ValidationError } from '../../../../base';
import { GenericComponent, type GenericComponentFields } from '../base';

// oxlint-disable-next-line no-redeclare -- a value-and-type pair, like the Python Literal
export const NICState = { ACTIVE: 'active', IDLE: 'idle' } as const;
export type NICState = (typeof NICState)[keyof typeof NICState];

export interface ScaleOutNICCardFields extends GenericComponentFields {
  state: NICState | string;
}

export type ScaleOutNICCardType = new (fields: ScaleOutNICCardFields) => ScaleOutNICCard;

export abstract class ScaleOutNICCard extends GenericComponent {
  static override readonly typeName: string = 'ScaleOutNICCard';
  static readonly bandwidth_gbps: number;
  static readonly idle_power_w: number;
  static readonly active_power_w: number;
  readonly state: NICState;

  constructor({ state, ...fields }: ScaleOutNICCardFields) {
    super(fields);
    if (typeof state !== 'string') {
      throw new ValidationError("NIC state must be 'active' or 'idle'");
    }
    if (state !== NICState.ACTIVE && state !== NICState.IDLE) {
      throw new ValidationError(`${py_repr(state)} is not a valid NICState`);
    }
    this.state = state;
  }

  private get type(): typeof ScaleOutNICCard {
    return this.constructor as typeof ScaleOutNICCard;
  }

  get active_power_w(): number {
    return this.type.active_power_w;
  }

  get idle_power_w(): number {
    return this.type.idle_power_w;
  }

  get bandwidth_gbps(): number {
    return this.type.bandwidth_gbps;
  }

  estimate_w(): number {
    return this.state === NICState.ACTIVE ? this.active_power_w : this.idle_power_w;
  }

  for_operating_state(state: OperatingState): ScaleOutNICCard {
    const type = this.constructor as ScaleOutNICCardType;
    return new type({ provenance: this.provenance, state: state.nic_state });
  }

  protected override _details(): Details {
    return [
      ['state', this.state],
      ['bandwidth_gbps', this.bandwidth_gbps],
      ['active_power_w', this.active_power_w],
      ['idle_power_w', this.idle_power_w],
    ];
  }

  protected override fields(): Record<string, unknown> {
    return { ...super.fields(), state: this.state };
  }
}
