// SPDX-License-Identifier: GPL-3.0-only

import { nic_power_baseline } from '../../profiles';
import { ScaleOutNICCard, type ScaleOutNICCardFields } from './nic';

const BASELINE = nic_power_baseline('connectx8', 30, 50);

export class ConnectX8NICCard extends ScaleOutNICCard {
  static override readonly typeName: string = 'ConnectX8NICCard';
  static override readonly bandwidth_gbps: number = 800;
  static override readonly idle_power_w: number = 30;
  static override readonly active_power_w: number = 50;

  constructor({ provenance = BASELINE, ...fields }: ScaleOutNICCardFields) {
    super({ provenance, ...fields });
  }
}
