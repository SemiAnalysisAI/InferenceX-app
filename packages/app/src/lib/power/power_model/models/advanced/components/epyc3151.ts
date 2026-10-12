// SPDX-License-Identifier: GPL-3.0-only
/** NVSwitch tray management CPU; independent of inference workload. */

import { Provenance, ValidationError } from '../../../base';
import { FixedPowerComponent } from './base';

const EPYC_EMBEDDED_3151 = new Provenance({
  profile_id: 'epyc-embedded-3151',
  version: '1',
  kind: 'assumed',
  source: 'User-specified 45 W operating budget',
  input_boundary: 'One management CPU electrical budget after tray DC/DC; excludes memory',
  assumptions: [
    'The 45 W TDP is used as a fixed intermediate-rail operating budget in this model.',
    'Local CPU regulation is treated as included in this provisional budget.',
  ],
});

export class EPYCEmbedded3151CPU extends FixedPowerComponent {
  static override readonly typeName: string = 'EPYCEmbedded3151CPU';

  constructor({
    power_w = 45,
    provenance = EPYC_EMBEDDED_3151,
  }: { power_w?: 45; provenance?: Provenance } = {}) {
    if (power_w !== 45) throw new ValidationError('Input should be 45.0');
    super({ power_w, provenance });
  }
}
