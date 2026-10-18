// SPDX-License-Identifier: GPL-3.0-only
/** Thor-2 modeled at 400 Gbit/s. */

import { nic_power_baseline } from '../../profiles';
import { ScaleOutNICCard, type ScaleOutNICCardFields } from './nic';

const BASELINE = nic_power_baseline('thor2', 20, 30);

export class Thor2NICCard extends ScaleOutNICCard {
  static override readonly typeName: string = 'Thor2NICCard';
  static override readonly bandwidth_gbps: number = 400;
  static override readonly idle_power_w: number = 20;
  static override readonly active_power_w: number = 30;

  constructor({ provenance = BASELINE, ...fields }: ScaleOutNICCardFields) {
    super({ provenance, ...fields });
  }
}
