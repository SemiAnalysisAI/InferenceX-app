// SPDX-License-Identifier: GPL-3.0-only
/** An example using a one-GPU reference scope and the agreed 1.5 IT multiplier. */

import {
  type ITPowerBreakdown,
  PowerComponentBreakdown,
  PowerModel,
  type PowerModelFields,
  Provenance,
  ValidationError,
  ValueError,
} from '../base';

export class ExamplePowerModel extends PowerModel {
  static override readonly typeName: string = 'ExamplePowerModel';

  constructor(fields: PowerModelFields) {
    super(fields);
    if (this.cpu_offload) {
      throw new ValidationError('CPU offloading requires OSSAllinPowerModel with DDR5 inventory');
    }
  }

  protected _estimate_it_power(
    gpu_level_power_per_gpu: number,
    cpu_and_dram_measured_power_per_socket: number | null,
    cpu_measured_power_per_socket: number | null,
  ): ITPowerBreakdown {
    if (cpu_and_dram_measured_power_per_socket !== null) {
      throw new ValueError(
        "cpu_and_dram_measured_power_per_socket requires the oss model's Grace inventory",
      );
    }
    if (cpu_measured_power_per_socket !== null) {
      throw new ValueError(
        "cpu_measured_power_per_socket requires the oss model's x86 CPU inventory",
      );
    }
    return {
      scope: 'per_gpu_reference',
      gpu_count: 1,
      components: [
        new PowerComponentBreakdown({
          name: 'GPU',
          power_w: gpu_level_power_per_gpu,
          provenance: new Provenance({
            profile_id: 'gpu-input',
            version: '1',
            source: 'gpu_level_power_per_gpu argument',
            kind: 'input',
            input_boundary: 'GPU electrical power, excluding other IT components',
          }),
        }),
        new PowerComponentBreakdown({
          name: 'Estimated non-GPU IT power',
          power_w: gpu_level_power_per_gpu * 0.5,
          provenance: new Provenance({
            profile_id: 'example',
            version: '1',
            source: 'User-specified 1.5 IT multiplier',
            kind: 'assumed',
            input_boundary: 'All non-GPU IT power, including networking',
            assumptions: ['Non-GPU IT power is 0.5 times GPU power.'],
          }),
        }),
      ],
    };
  }
}
