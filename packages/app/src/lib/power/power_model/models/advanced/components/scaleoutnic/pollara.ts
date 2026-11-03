// SPDX-License-Identifier: GPL-3.0-only

import { POLLARA_NIC_BASELINE } from '../../profiles';
import { ScaleOutNICCard, type ScaleOutNICCardFields } from './nic';

export class PollaraNICCard extends ScaleOutNICCard {
  static override readonly typeName: string = 'PollaraNICCard';
  static override readonly bandwidth_gbps: number = 400;
  static override readonly idle_power_w: number = 34.5;
  static override readonly active_power_w: number = 34.5;

  constructor({ provenance = POLLARA_NIC_BASELINE, ...fields }: ScaleOutNICCardFields) {
    super({ provenance, ...fields });
  }
}
