// SPDX-License-Identifier: GPL-3.0-only
/** ConnectX-7 modeled at 400 Gbit/s. */

import { nic_power_baseline } from '../../profiles';
import { ScaleOutNICCard, type ScaleOutNICCardFields } from './nic';

const BASELINE = nic_power_baseline('connectx7', 15, 25);

export class ConnectX7NICCard extends ScaleOutNICCard {
  static override readonly typeName: string = 'ConnectX7NICCard';
  static override readonly bandwidth_gbps: number = 400;
  static override readonly idle_power_w: number = 15;
  static override readonly active_power_w: number = 25;

  constructor({ provenance = BASELINE, ...fields }: ScaleOutNICCardFields) {
    super({ provenance, ...fields });
  }
}
