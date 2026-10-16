// SPDX-License-Identifier: GPL-3.0-only
/** Pollara modeled at 400 Gbit/s. */

import { nic_power_baseline } from '../../profiles';
import { ScaleOutNICCard, type ScaleOutNICCardFields } from './nic';

const BASELINE = nic_power_baseline('pollara', 20, 30);

export class PollaraNICCard extends ScaleOutNICCard {
  static override readonly typeName: string = 'PollaraNICCard';
  static override readonly bandwidth_gbps: number = 400;
  static override readonly idle_power_w: number = 20;
  static override readonly active_power_w: number = 30;

  constructor({ provenance = BASELINE, ...fields }: ScaleOutNICCardFields) {
    super({ provenance, ...fields });
  }
}
