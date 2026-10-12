// SPDX-License-Identifier: GPL-3.0-only
/* oxlint-disable max-classes-per-file -- mirrors the upstream Python module, class for class */
/** HGX chassis with a GPU-bearing UBB and a shared CPU, NIC, DIMM, and drive inventory. */

import {
  DEFAULT_OPERATING_STATE,
  type JsonObject,
  OperatingState,
  PowerComponentBreakdown,
  sum_watts,
  validate_count,
  ValidationError,
  ValueError,
  WorkloadState,
} from '../../../base';
import { CoolingProfile } from '../../../cooling';
import { ComponentGroup } from '../components/base';
import type { FanPower } from '../components/fan';
import {
  CPU,
  DDR5DIMM,
  NVMeDrive,
  PCIeSwitch,
  PEX89144PCIeSwitch,
  SystemSide400GTransceiver,
  SystemSide800GTransceiver,
  SystemSideTransceiver,
  type SystemSideTransceiverType,
  X86CPU,
} from '../components/generic';
import { HGXFanPolicy, NormalizedHGXFanPower } from '../components/hgx_fans';
import {
  B200PSUEfficiency,
  B300PSUEfficiency,
  HopperPSUEfficiency,
  MI300PSUEfficiency,
  MI325PSUEfficiency,
  MI355PSUEfficiency,
  type PSUEfficiencyModel,
} from '../components/psu';
import { ConnectX7NICCard } from '../components/scaleoutnic/connectx7';
import { type ScaleOutNICCardType, ScaleOutNICCard } from '../components/scaleoutnic/nic';
import { PollaraNICCard } from '../components/scaleoutnic/pollara';
import { Thor2NICCard } from '../components/scaleoutnic/thor2';
import { B200HGXBoard } from '../components/ubb/b200_hgx';
import { B300HGXBoard } from '../components/ubb/b300_hgx';
import { HopperHGXBoard } from '../components/ubb/hopper_hgx';
import { MI300UBB } from '../components/ubb/mi300_ubb';
import { MI325UBB } from '../components/ubb/mi325_ubb';
import { MI355UBB } from '../components/ubb/mi355_ubb';
import type { UniversalBaseBoard } from '../components/ubb/ubb';
import { AMD_TWO_TIER_NETWORK, B300_TWO_TIER_NETWORK } from '../networking/ethernet_512t';
import type { NetworkGroup } from '../networking/base';
import { QM9790_TWO_TIER_NETWORK } from '../networking/qm9790';
import { _profile_parameters, GPUSystem, type SystemEstimateOptions } from './base';

export const DESIGN_OPERATING_STATE = new OperatingState({
  workload_state: WorkloadState.AGENTIC_CPU_OFFLOADING,
  using_scale_out: true,
});

export interface HGXSystemChassisFields {
  components?: readonly ComponentGroup[];
  gpu_count?: number;
  nvme_count?: number;
  ubb: UniversalBaseBoard;
  psu: PSUEfficiencyModel;
  fan_policy?: HGXFanPolicy;
}

type ChassisDefaults = Partial<HGXSystemChassisFields>;

export abstract class HGXSystemChassis extends GPUSystem {
  static override readonly typeName: string = 'HGXSystemChassis';
  static override readonly default_cooling: CoolingProfile = new CoolingProfile({ mode: 'air' });
  static readonly cpu_count: number = 2;
  static readonly dimm_count: number = 32;
  static readonly dimm_capacity_gb: number = 64;
  static readonly default_nic_type: ScaleOutNICCardType | null;
  static readonly system_nic_count: number = 8;
  static readonly default_transceiver_type: SystemSideTransceiverType = SystemSide400GTransceiver;
  static readonly transceiver_count: number = 8;
  static readonly pex89144_count: number = 0;
  readonly components: readonly ComponentGroup[];
  readonly nvme_count: number;
  readonly ubb: UniversalBaseBoard;
  readonly psu: PSUEfficiencyModel;
  readonly fan_policy: HGXFanPolicy;

  constructor({
    components = [],
    gpu_count = 8,
    nvme_count = 10,
    ubb,
    psu,
    fan_policy = new HGXFanPolicy(),
  }: HGXSystemChassisFields) {
    super({ gpu_count });
    this.components = components;
    this.nvme_count = validate_count(nvme_count);
    this.ubb = ubb;
    this.psu = psu;
    this.fan_policy = fan_policy;
    if (this.gpu_count !== 8 || this.ubb.gpu_count !== this.gpu_count) {
      throw new ValidationError('An HGX chassis and its UBB must both contain exactly 8 GPUs');
    }
    if (this.nvme_count !== 10) {
      throw new ValidationError('An HGX chassis must contain exactly 10 NVMe drives');
    }
    for (const group of this.components) {
      const owned = [
        CPU,
        DDR5DIMM,
        ScaleOutNICCard,
        SystemSideTransceiver,
        NVMeDrive,
        PEX89144PCIeSwitch,
      ];
      if (owned.some((type) => group.component instanceof type)) {
        throw new ValidationError(
          `${group.component.typeName} inventory is owned by ${this.system_type}; ` +
            'pass workload_state and using_scale_out to the power model instead',
        );
      }
    }
  }

  private get hgx(): typeof HGXSystemChassis {
    return this.constructor as typeof HGXSystemChassis;
  }

  _component_groups(state: OperatingState): ComponentGroup[] {
    const hgx = this.hgx;
    const groups = [
      new ComponentGroup({
        component: X86CPU.for_workload(state.workload_state),
        quantity: hgx.cpu_count,
      }),
    ];
    if (hgx.system_nic_count) {
      if (hgx.default_nic_type === null) {
        throw new ValueError('Chassis-level NIC inventory requires a NIC type');
      }
      groups.push(
        new ComponentGroup({
          component: new hgx.default_nic_type({ state: state.nic_state }),
          quantity: hgx.system_nic_count,
        }),
      );
    }
    groups.push(
      new ComponentGroup({
        component: new DDR5DIMM({ capacity_gb: hgx.dimm_capacity_gb }).for_cpu_offload(
          state.cpu_offload,
        ),
        quantity: hgx.dimm_count,
      }),
      new ComponentGroup({ component: new NVMeDrive(), quantity: this.nvme_count }),
    );
    if (hgx.pex89144_count) {
      groups.push(
        new ComponentGroup({ component: new PEX89144PCIeSwitch(), quantity: hgx.pex89144_count }),
      );
    }
    groups.push(
      new ComponentGroup({
        component: new hgx.default_transceiver_type(),
        quantity: hgx.transceiver_count,
      }),
    );
    return [...groups, ...this.components];
  }

  _finish_system(
    system_components: readonly PowerComponentBreakdown[],
    { operating_state }: { operating_state: OperatingState },
  ): PowerComponentBreakdown {
    const state = operating_state;
    const groups = this._component_groups(state);
    const components = this._power_components([
      ...system_components,
      PowerComponentBreakdown.group(
        'Generic components',
        groups.map((group) => group.estimate_breakdown()),
      ),
    ]);
    const configuration = this._configuration(state);
    configuration.components = groups.map((group) => _profile_parameters(group));
    return PowerComponentBreakdown.group(this.system_type, components, {
      provenance: this.provenance,
      details: [['gpu_count_per_system', this.gpu_count]],
      configuration,
    });
  }

  override _configuration(state: OperatingState): JsonObject {
    return {
      ...super._configuration(state),
      ubb: _profile_parameters(this.ubb.for_operating_state(state)),
    };
  }

  get resolved_fan_power(): FanPower {
    if (this.ubb.gpu_tdp_w === null) {
      throw new ValueError('Automatic HGX fan sizing requires a GPU TDP on the UBB');
    }
    const board = this.ubb.for_operating_state(DESIGN_OPERATING_STATE);
    const host_watts = sum_watts([
      board.estimate_breakdown(0).power_w,
      ...this._component_groups(DESIGN_OPERATING_STATE).map(
        (group) => group.estimate_breakdown().power_w,
      ),
    ]);
    return new NormalizedHGXFanPower({
      gpu_tdp_w: board.gpu_tdp_w!,
      gpu_count: this.gpu_count,
      design_non_gpu_power_w: host_watts,
      policy: this.fan_policy,
    });
  }

  _power_components(components: readonly PowerComponentBreakdown[]): PowerComponentBreakdown[] {
    const component_dc_w = sum_watts(components.map((node) => node.power_w));
    const fans = this.resolved_fan_power.estimate_breakdown(component_dc_w);
    const dc_load_w = sum_watts([component_dc_w, fans.power_w]);
    const losses = this.psu.estimate_loss_breakdown(dc_load_w);
    return [...components, losses, fans];
  }

  estimate_it_power(
    gpu_level_power_per_gpu: number,
    { operating_state = DEFAULT_OPERATING_STATE }: SystemEstimateOptions = {},
  ): PowerComponentBreakdown {
    const board = this.ubb.for_operating_state(operating_state);
    return this._finish_system([board.estimate_breakdown(gpu_level_power_per_gpu)], {
      operating_state,
    });
  }

  protected override fields(): Record<string, unknown> {
    return {
      ...super.fields(),
      components: this.components,
      nvme_count: this.nvme_count,
      ubb: this.ubb,
      psu: this.psu,
      fan_policy: this.fan_policy,
    };
  }
}

export class MI300HGXSystemChassis extends HGXSystemChassis {
  static override readonly typeName: string = 'MI300HGXSystemChassis';
  static override readonly default_networking: readonly NetworkGroup[] = [AMD_TWO_TIER_NETWORK];
  static override readonly pex89144_count: number = 4;
  static override readonly default_nic_type: ScaleOutNICCardType = Thor2NICCard;

  constructor({
    psu = new MI300PSUEfficiency(),
    ubb = new MI300UBB(),
    ...rest
  }: ChassisDefaults = {}) {
    super({ psu, ubb, ...rest });
  }
}

export class MI325HGXSystemChassis extends HGXSystemChassis {
  static override readonly typeName: string = 'MI325HGXSystemChassis';
  static override readonly default_networking: readonly NetworkGroup[] = [AMD_TWO_TIER_NETWORK];
  static override readonly pex89144_count: number = 4;
  static override readonly default_nic_type: ScaleOutNICCardType = Thor2NICCard;

  constructor({
    psu = new MI325PSUEfficiency(),
    ubb = new MI325UBB(),
    ...rest
  }: ChassisDefaults = {}) {
    super({ psu, ubb, ...rest });
  }
}

export class MI355HGXSystemChassis extends HGXSystemChassis {
  static override readonly typeName: string = 'MI355HGXSystemChassis';
  static override readonly default_networking: readonly NetworkGroup[] = [AMD_TWO_TIER_NETWORK];
  static override readonly pex89144_count: number = 4;
  static override readonly default_nic_type: ScaleOutNICCardType = PollaraNICCard;

  constructor({
    psu = new MI355PSUEfficiency(),
    ubb = new MI355UBB(),
    ...rest
  }: ChassisDefaults = {}) {
    super({ psu, ubb, ...rest });
  }
}

/** Shared HGX chassis model for H100 and H200 GPUs on a Hopper board. */
export class HopperHGXSystemChassis extends HGXSystemChassis {
  static override readonly typeName: string = 'HopperHGXSystemChassis';
  static override readonly default_networking: readonly NetworkGroup[] = [QM9790_TWO_TIER_NETWORK];
  static override readonly pex89144_count: number = 4;
  static override readonly default_nic_type: ScaleOutNICCardType = ConnectX7NICCard;

  constructor({
    psu = new HopperPSUEfficiency(),
    ubb = new HopperHGXBoard(),
    ...rest
  }: ChassisDefaults = {}) {
    super({ psu, ubb, ...rest });
  }
}

export class B200HGXSystemChassis extends HGXSystemChassis {
  static override readonly typeName: string = 'B200HGXSystemChassis';
  static override readonly default_networking: readonly NetworkGroup[] = [QM9790_TWO_TIER_NETWORK];
  static override readonly pex89144_count: number = 4;
  static override readonly default_nic_type: ScaleOutNICCardType = ConnectX7NICCard;

  constructor({
    psu = new B200PSUEfficiency(),
    ubb = new B200HGXBoard(),
    ...rest
  }: ChassisDefaults = {}) {
    super({ psu, ubb, ...rest });
  }
}

export class B300HGXSystemChassis extends HGXSystemChassis {
  static override readonly typeName: string = 'B300HGXSystemChassis';
  static override readonly default_networking: readonly NetworkGroup[] = [B300_TWO_TIER_NETWORK];
  static override readonly default_nic_type: ScaleOutNICCardType | null = null;
  static override readonly system_nic_count: number = 0;
  static override readonly default_transceiver_type: SystemSideTransceiverType =
    SystemSide800GTransceiver;

  constructor({
    psu = new B300PSUEfficiency(),
    ubb = new B300HGXBoard(),
    ...rest
  }: ChassisDefaults = {}) {
    super({ psu, ubb, ...rest });
    if (this.components.some((group) => group.component instanceof PCIeSwitch)) {
      throw new ValidationError('B300 has no chassis-level PCIe switches');
    }
  }
}
