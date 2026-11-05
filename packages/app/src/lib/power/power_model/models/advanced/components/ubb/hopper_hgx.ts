// SPDX-License-Identifier: GPL-3.0-only

import { type PowerComponentBreakdown, sum_watts, ValidationError } from '../../../../base';
import { HOPPER_BOARD_BASELINE } from '../../profiles';
import { ComponentGroup } from '../base';
import { PCIe5x16Retimer } from '../generic';
import { HopperHGXNVSwitch } from './hopper_hgx_nvswitch';
import { NVIDIA8WayHGXBoard } from './nvidia_8way_hgx';
import type { UniversalBaseBoardFields } from './ubb';

const BOARD_COMPONENTS = [
  new ComponentGroup({ component: new HopperHGXNVSwitch(), quantity: 4 }),
  new ComponentGroup({ component: new PCIe5x16Retimer(), quantity: 8 }),
];
const NON_GPU_POWER_W = sum_watts(BOARD_COMPONENTS.map((g) => g.estimate_breakdown().power_w));

export class HopperHGXBoard extends NVIDIA8WayHGXBoard {
  static override readonly typeName: string = 'HopperHGXBoard';
  static readonly board_components: readonly ComponentGroup[] = BOARD_COMPONENTS;

  constructor({
    gpu_tdp_w = 700,
    non_gpu_power_w = NON_GPU_POWER_W,
    provenance = HOPPER_BOARD_BASELINE,
    ...fields
  }: Partial<UniversalBaseBoardFields> = {}) {
    if (gpu_tdp_w !== 700) throw new ValidationError('Input should be 700');
    super({ gpu_tdp_w, non_gpu_power_w, provenance, ...fields });
    const expected = sum_watts(this._non_gpu_components().map((node) => node.power_w));
    if (this.non_gpu_power_w !== expected) {
      throw new ValidationError(
        'Hopper non-GPU board power is determined by its switches and retimers',
      );
    }
  }

  _non_gpu_components(): PowerComponentBreakdown[] {
    return HopperHGXBoard.board_components.map((group) => group.estimate_breakdown());
  }
}
