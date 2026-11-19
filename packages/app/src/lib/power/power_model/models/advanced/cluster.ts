// SPDX-License-Identifier: GPL-3.0-only

import {
  DEFAULT_OPERATING_STATE,
  FrozenModel,
  type ITPowerBreakdown,
  type OperatingState,
  PowerComponentBreakdown,
  validate_watts,
  ValidationError,
} from '../../base';
import type { NetworkGroup } from './networking/base';
import type { SystemEstimateOptions, SystemGroup } from './systems/base';

export class Cluster extends FrozenModel {
  static override readonly typeName: string = 'Cluster';
  readonly systems: readonly SystemGroup[];
  readonly networking: readonly NetworkGroup[];

  constructor({
    systems,
    networking,
  }: {
    systems: readonly SystemGroup[];
    networking: readonly NetworkGroup[];
  }) {
    super();
    if (systems.length === 0) {
      throw new ValidationError('Tuple should have at least 1 item after validation');
    }
    this.systems = systems;
    this.networking = networking;
  }

  get gpu_count(): number {
    return this.systems.reduce((total, group) => total + group.gpu_count, 0);
  }

  estimate_it_power(
    gpu_level_power_per_gpu: number,
    {
      cpu_and_dram_measured_power_per_socket = null,
      cpu_measured_power_per_socket = null,
      operating_state = DEFAULT_OPERATING_STATE,
    }: SystemEstimateOptions & { operating_state?: OperatingState } = {},
  ): ITPowerBreakdown {
    const per_gpu = validate_watts(gpu_level_power_per_gpu);
    return {
      scope: 'cluster',
      gpu_count: this.gpu_count,
      components: [
        PowerComponentBreakdown.group(
          'GPU systems',
          this.systems.map((group) =>
            group.estimate_it_power(per_gpu, {
              cpu_and_dram_measured_power_per_socket,
              cpu_measured_power_per_socket,
              operating_state,
            }),
          ),
        ),
        PowerComponentBreakdown.group(
          'Scale-out networking',
          this.networking.map((group) => group.estimate_breakdown({ operating_state })),
        ),
      ],
    };
  }

  protected fields() {
    return { systems: this.systems, networking: this.networking };
  }
}
