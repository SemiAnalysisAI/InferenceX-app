// SPDX-License-Identifier: GPL-3.0-only

import {
  type OperatingState,
  type PowerComponentBreakdown,
  sum_watts,
  validate_instance,
  ValidationError,
} from '../../../../base';
import { B300_BOARD_BASELINE } from '../../profiles';
import { ComponentGroup } from '../base';
import { ConnectX8NICCard } from '../scaleoutnic/connectx8';
import { BlackwellHGXNVSwitch } from './blackwell_hgx_nvswitch';
import { NVIDIA8WayHGXBoard } from './nvidia_8way_hgx';
import type { UniversalBaseBoardFields } from './ubb';

export interface B300HGXBoardFields extends Partial<UniversalBaseBoardFields> {
  nic?: ConnectX8NICCard;
}

export class B300HGXBoard extends NVIDIA8WayHGXBoard {
  static override readonly typeName: string = 'B300HGXBoard';
  readonly nic: ConnectX8NICCard;

  constructor({
    gpu_tdp_w = 1200,
    nic = new ConnectX8NICCard({ state: 'idle' }),
    non_gpu_power_w,
    provenance = B300_BOARD_BASELINE,
    ...fields
  }: B300HGXBoardFields = {}) {
    if (gpu_tdp_w !== 1200) throw new ValidationError('Input should be 1200');
    validate_instance(nic, ConnectX8NICCard);
    super({
      gpu_tdp_w,
      non_gpu_power_w:
        non_gpu_power_w ??
        sum_watts(B300HGXBoard._board_groups(nic).map((g) => g.estimate_breakdown().power_w)),
      provenance,
      ...fields,
    });
    this.nic = nic;
    const expected = sum_watts(this._non_gpu_components().map((node) => node.power_w));
    if (this.non_gpu_power_w !== expected) {
      throw new ValidationError(
        'B300 non-GPU board power is determined by its switches and NIC state',
      );
    }
  }

  override for_operating_state(state: OperatingState): B300HGXBoard {
    return new B300HGXBoard({
      gpu_tdp_w: this.gpu_tdp_w ?? undefined,
      gpu_count: this.gpu_count,
      provenance: this.provenance,
      nic: this.nic.for_operating_state(state) as ConnectX8NICCard,
    });
  }

  static _board_groups(nic: ConnectX8NICCard): ComponentGroup[] {
    return [
      new ComponentGroup({ component: new BlackwellHGXNVSwitch(), quantity: 2 }),
      new ComponentGroup({ component: nic, quantity: 8 }),
    ];
  }

  _non_gpu_components(): PowerComponentBreakdown[] {
    return B300HGXBoard._board_groups(this.nic).map((group) => group.estimate_breakdown());
  }

  protected override fields(): Record<string, unknown> {
    return { ...super.fields(), nic: this.nic };
  }
}
