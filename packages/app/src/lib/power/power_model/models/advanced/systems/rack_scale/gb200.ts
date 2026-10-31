// SPDX-License-Identifier: GPL-3.0-only

import { validate_instance } from '../../../../base';
import { NetworkGroup } from '../../networking/base';
import { QM9700NDRInfiniBandSwitch } from '../../networking/qm9700';
import { GB200ComputeTray } from './compute_tray';
import { RackScaleSystem, type RackScaleSystemFields } from './rack_scale';

export class GB200NVL72RackScaleSystem extends RackScaleSystem {
  static override readonly typeName: string = 'GB200NVL72RackScaleSystem';
  static override readonly default_networking: readonly NetworkGroup[] = [
    new NetworkGroup({
      gear: new QM9700NDRInfiniBandSwitch(),
      quantity: 3.375,
      details: [
        ['topology', 'two-tier'],
        ['switches_per_rack', 3.375],
        ['allocation_basis', 'User-specified: 3.375 QM9700 switches per rack'],
      ],
    }),
  ];

  constructor({
    compute_tray = new GB200ComputeTray(),
    ...rest
  }: Partial<RackScaleSystemFields> = {}) {
    super({ compute_tray: validate_instance(compute_tray, GB200ComputeTray), ...rest });
  }
}
