// SPDX-License-Identifier: GPL-3.0-only
/** Shared AMD UBB inventory: eight GPUs and eight PCIe 5.0 x16 retimers. */

import { type PowerComponentBreakdown, sum_watts, ValidationError } from '../../../../base';
import { AMD_UBB_BASELINE } from '../../profiles';
import { ComponentGroup } from '../base';
import { PCIe5x16Retimer } from '../generic';
import { UniversalBaseBoard, type UniversalBaseBoardFields } from './ubb';

const BOARD_COMPONENTS = [new ComponentGroup({ component: new PCIe5x16Retimer(), quantity: 8 })];
const NON_GPU_POWER_W = sum_watts(BOARD_COMPONENTS.map((g) => g.estimate_breakdown().power_w));

export abstract class AMD8WayUBB extends UniversalBaseBoard {
  static override readonly typeName: string = 'AMD8WayUBB';
  static readonly board_components: readonly ComponentGroup[] = BOARD_COMPONENTS;

  constructor({
    non_gpu_power_w = NON_GPU_POWER_W,
    provenance = AMD_UBB_BASELINE,
    ...fields
  }: Partial<UniversalBaseBoardFields> = {}) {
    super({ non_gpu_power_w, provenance, ...fields });
    const expected = sum_watts(this._non_gpu_components().map((node) => node.power_w));
    if (this.non_gpu_power_w !== expected) {
      throw new ValidationError('AMD UBB non-GPU board power is determined by its eight retimers');
    }
  }

  _non_gpu_components(): PowerComponentBreakdown[] {
    return AMD8WayUBB.board_components.map((group) => group.estimate_breakdown());
  }
}
