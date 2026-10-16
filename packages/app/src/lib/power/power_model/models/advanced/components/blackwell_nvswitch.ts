// SPDX-License-Identifier: GPL-3.0-only
/** Rack NVLink switch ASIC, separate from external scale-out gear. */

import { type Details, Provenance } from '../../../base';
import { FixedPowerComponent } from './base';

const RACK_BLACKWELL_NVSWITCH = new Provenance({
  profile_id: 'rack-blackwell-nvswitch',
  version: '1',
  kind: 'estimated',
  source: 'Project Blackwell NVSwitch budget',
  input_boundary: 'One rack NVSwitch electrical load downstream of tray conversion',
  assumptions: [
    '28.8 Tbit/s; 200 W borrowed provisionally from the HGX switch assumption.',
    'Always powered; external scale-out state does not disable NVLink.',
    'Local switch regulation is included in this provisional electrical budget.',
  ],
});

export class BlackwellNVSwitch extends FixedPowerComponent {
  static override readonly typeName: string = 'BlackwellNVSwitch';

  constructor({
    power_w = 200,
    provenance = RACK_BLACKWELL_NVSWITCH,
  }: { power_w?: number; provenance?: Provenance } = {}) {
    super({ power_w, provenance });
  }

  protected override _details(): Details {
    return [
      ['bandwidth_tbps', 28.8],
      ['power_policy', 'always_on'],
    ];
  }
}
