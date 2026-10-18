// SPDX-License-Identifier: GPL-3.0-only
/** Shared state selection and accounting for switches with always-powered optics. */

import {
  type OperatingState,
  PowerComponentBreakdown,
  type Provenance,
  sum_watts,
  ValidationError,
} from '../../../base';
import { ComponentGroup } from '../components/base';
import { SwitchSide800GSR8Transceiver } from '../components/generic';
import { ScaleOutNetworkingGear } from './base';

export type SwitchState = 'idle' | 'active';

export interface OpticalScaleOutSwitchFields {
  state?: SwitchState;
  power_w?: number;
  provenance?: Provenance;
}

/** The class-level constants of a concrete switch (Python ClassVars). */
export interface OpticalSwitchSpec {
  name: string;
  bandwidth_tbps: number;
  idle_power_w: number;
  active_power_w: number;
  optics_count: number;
  box_name: string;
  protocol: string;
  switch_provenance: Provenance;
}

type OpticalSwitchType = (new (fields?: OpticalScaleOutSwitchFields) => OpticalScaleOutSwitch) & {
  readonly spec: OpticalSwitchSpec;
};

export abstract class OpticalScaleOutSwitch extends ScaleOutNetworkingGear {
  static override readonly typeName: string = 'OpticalScaleOutSwitch';
  static readonly spec: OpticalSwitchSpec;
  readonly state: SwitchState;

  constructor(
    spec: OpticalSwitchSpec,
    { state = 'idle', power_w, provenance }: OpticalScaleOutSwitchFields,
  ) {
    if (state !== 'idle' && state !== 'active') {
      throw new ValidationError("Input should be 'idle' or 'active'");
    }
    super({
      name: spec.name,
      power_w:
        power_w ?? sum_watts(OpticalScaleOutSwitch._components(spec, state).map((n) => n.power_w)),
      provenance: provenance ?? spec.switch_provenance,
    });
    this.state = state;
    const expected = sum_watts(
      OpticalScaleOutSwitch._components(spec, this.state).map((node) => node.power_w),
    );
    if (this.power_w !== expected) {
      throw new ValidationError(
        `${this.name} power is determined by switch state and its ${spec.optics_count} optics`,
      );
    }
  }

  get spec(): OpticalSwitchSpec {
    return (this.constructor as OpticalSwitchType).spec;
  }

  get bandwidth_tbps(): number {
    return this.spec.bandwidth_tbps;
  }

  get optics_count(): number {
    return this.spec.optics_count;
  }

  get protocol(): string {
    return this.spec.protocol;
  }

  static _components(spec: OpticalSwitchSpec, state: SwitchState): PowerComponentBreakdown[] {
    return [
      new PowerComponentBreakdown({
        name: spec.box_name,
        power_w: state === 'active' ? spec.active_power_w : spec.idle_power_w,
        provenance: spec.switch_provenance,
        details: [
          ['state', state],
          ['bandwidth_tbps', spec.bandwidth_tbps],
        ],
      }),
      new ComponentGroup({
        component: new SwitchSide800GSR8Transceiver(),
        quantity: spec.optics_count,
      }).estimate_breakdown(),
    ];
  }

  for_operating_state(state: OperatingState): OpticalScaleOutSwitch {
    const type = this.constructor as OpticalSwitchType;
    return new type({ provenance: this.provenance, state: state.nic_state });
  }

  estimate_breakdown(): PowerComponentBreakdown {
    return PowerComponentBreakdown.group(
      this.name,
      OpticalScaleOutSwitch._components(this.spec, this.state),
      {
        provenance: this.provenance,
        details: [
          ['state', this.state],
          ['bandwidth_tbps', this.bandwidth_tbps],
          ['protocol', this.protocol],
          ['optics_per_switch', this.optics_count],
        ],
      },
    );
  }

  protected override fields(): Record<string, unknown> {
    return { ...super.fields(), state: this.state };
  }
}
