// SPDX-License-Identifier: GPL-3.0-only
/** GB300 NVL72 and its endpoint-based external fabric allocation. */

import { NetworkGroup } from '../../networking/base';
import { Generic512TEthernetSwitch } from '../../networking/ethernet_512t';
import { GB300ComputeTray } from './compute_tray';
import { RackScaleSystem, type RackScaleSystemFields } from './rack_scale';

export class GB300NVL72RackScaleSystem extends RackScaleSystem {
  static override readonly typeName: string = 'GB300NVL72RackScaleSystem';
  static override readonly default_networking: readonly NetworkGroup[] = [
    new NetworkGroup({
      gear: new Generic512TEthernetSwitch(),
      quantity: 3.375,
      details: [
        ['topology', 'two-tier'],
        ['switches_per_rack', 3.375],
        ['allocation_basis', 'User-specified: 3.375 51.2T Ethernet switches per rack'],
      ],
    }),
  ];

  constructor({
    compute_tray = new GB300ComputeTray(),
    ...rest
  }: Partial<RackScaleSystemFields> = {}) {
    super({ compute_tray, ...rest });
  }
}
