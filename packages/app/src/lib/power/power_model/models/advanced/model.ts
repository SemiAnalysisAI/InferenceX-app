// SPDX-License-Identifier: GPL-3.0-only

import {
  type ITPowerBreakdown,
  PowerModel,
  type PowerModelFields,
  ValueError,
  type WorkloadState,
} from '../../base';
import { Cluster } from './cluster';
import { type GPUSystemType, SystemGroup } from './systems/base';
import { get_system_class } from './systems/catalog';

export interface ForSystemOptions {
  workload_state?: WorkloadState | string;
  using_scale_out?: boolean;
  systems?: number;
}

export class OSSAllinPowerModel extends PowerModel {
  static override readonly typeName: string = 'OSSAllinPowerModel';
  readonly cluster: Cluster;

  constructor({ cluster, ...fields }: PowerModelFields & { cluster: Cluster }) {
    super(fields);
    this.cluster = cluster;
  }

  static for_system(
    system: string | GPUSystemType,
    { workload_state, using_scale_out = false, systems = 1 }: ForSystemOptions = {},
  ): OSSAllinPowerModel {
    const system_class = get_system_class(system);
    const hardware = new system_class();
    const system_group = new SystemGroup({ system: hardware, quantity: systems });
    if (hardware.default_networking === null) {
      throw new ValueError(`${hardware.system_type} must define its scale-out network model`);
    }
    const networking = hardware.default_networking.map((group) =>
      group.scaled(system_group.quantity),
    );
    return new OSSAllinPowerModel({
      cooling: system_class.default_cooling,
      workload_state,
      using_scale_out,
      cluster: new Cluster({ systems: [system_group], networking }),
    });
  }

  protected _estimate_it_power(
    gpu_level_power_per_gpu: number,
    cpu_and_dram_measured_power_per_socket: number | null,
    cpu_measured_power_per_socket: number | null,
  ): ITPowerBreakdown {
    return this.cluster.estimate_it_power(gpu_level_power_per_gpu, {
      cpu_and_dram_measured_power_per_socket,
      cpu_measured_power_per_socket,
      operating_state: this.operating_state,
    });
  }

  protected override fields(): Record<string, unknown> {
    return { ...super.fields(), cluster: this.cluster };
  }
}
