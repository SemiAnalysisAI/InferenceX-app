// SPDX-License-Identifier: GPL-3.0-only
/** The eight-GPU UBB interface with component-owned board power. */

import {
  FrozenModel,
  type OperatingState,
  PowerComponentBreakdown,
  type Provenance,
  validate_count,
  validate_watts,
  ValidationError,
} from '../../../../base';
import { COMPONENT_INPUT, GPU_INPUT } from '../../profiles';

export interface UniversalBaseBoardFields {
  /** Maximum design power of one GPU module in watts at the GPU boundary. */
  gpu_tdp_w?: number | null;
  gpu_count?: number;
  non_gpu_power_w: number;
  provenance?: Provenance;
}

export abstract class UniversalBaseBoard extends FrozenModel {
  static override readonly typeName: string = 'UniversalBaseBoard';
  readonly gpu_tdp_w: number | null;
  readonly gpu_count: number;
  readonly non_gpu_power_w: number;
  readonly provenance: Provenance;

  constructor({
    gpu_tdp_w = null,
    gpu_count = 8,
    non_gpu_power_w,
    provenance = COMPONENT_INPUT,
  }: UniversalBaseBoardFields) {
    super();
    if (gpu_tdp_w !== null && (!Number.isFinite(gpu_tdp_w) || !(gpu_tdp_w > 0))) {
      throw new ValidationError('Input should be greater than 0');
    }
    this.gpu_tdp_w = gpu_tdp_w;
    this.gpu_count = validate_count(gpu_count);
    this.non_gpu_power_w = validate_watts(non_gpu_power_w);
    this.provenance = provenance;
    if (this.gpu_count !== 8) {
      throw new ValidationError('An HGX UniversalBaseBoard must contain exactly 8 GPUs');
    }
  }

  /** Boards without state-dependent components retain their fixed inventory. */
  for_operating_state(_state: OperatingState): UniversalBaseBoard {
    return this;
  }

  /** Return the inventory contributing non-GPU board power. */
  abstract _non_gpu_components(): PowerComponentBreakdown[];

  estimate_breakdown(gpu_level_power_per_gpu: number): PowerComponentBreakdown {
    const per_gpu = validate_watts(gpu_level_power_per_gpu);
    return PowerComponentBreakdown.group(
      this.typeName,
      [
        new PowerComponentBreakdown({
          name: 'GPUs',
          power_w: this.gpu_count * per_gpu,
          quantity: this.gpu_count,
          provenance: GPU_INPUT,
          details: [
            ['gpu_level_power_per_gpu', per_gpu],
            ...(this.gpu_tdp_w === null ? [] : [['gpu_tdp_w', this.gpu_tdp_w] as const]),
          ],
        }),
        ...this._non_gpu_components(),
      ],
      { provenance: this.provenance },
    );
  }

  protected fields(): Record<string, unknown> {
    return {
      gpu_tdp_w: this.gpu_tdp_w,
      gpu_count: this.gpu_count,
      non_gpu_power_w: this.non_gpu_power_w,
      provenance: this.provenance,
    };
  }
}
