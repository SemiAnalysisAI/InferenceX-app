// SPDX-License-Identifier: GPL-3.0-only
/** Generic 51.2 Tbit/s Ethernet switch and two-tier allocations for AMD and B300. */

import { Provenance } from '../../../base';
import { NetworkGroup } from './base';
import {
  OpticalScaleOutSwitch,
  type OpticalScaleOutSwitchFields,
  type OpticalSwitchSpec,
} from './optical_switch';

export const ETHERNET_512T_BASELINE = new Provenance({
  profile_id: 'generic-51.2t-ethernet-switch',
  version: '1',
  source: 'User-specified model baseline',
  kind: 'assumed',
  input_boundary: 'External switch ASIC plus switch-side optics power budget; excludes PUE',
  assumptions: [
    'Generic Ethernet switch bandwidth is 51.2 Tbit/s.',
    'The ASIC uses 539 W idle or 900 W active, excluding separately modeled optics.',
    '64 always-powered 800G SR8 optics use the shared 15 W per-optic assumption.',
    'Use the specified ASIC-plus-optics budget as external IT power; ' +
      'no HGX fan/PSU model applies.',
  ],
});

export class Generic512TEthernetSwitch extends OpticalScaleOutSwitch {
  static override readonly typeName: string = 'Generic512TEthernetSwitch';
  static override readonly spec: OpticalSwitchSpec = {
    name: 'Generic512TEthernetSwitch',
    bandwidth_tbps: 51.2,
    idle_power_w: 539,
    active_power_w: 900,
    optics_count: 64,
    box_name: 'Generic 51.2T Ethernet switch ASIC',
    protocol: 'Ethernet',
    switch_provenance: ETHERNET_512T_BASELINE,
  };

  constructor(fields: OpticalScaleOutSwitchFields = {}) {
    super(Generic512TEthernetSwitch.spec, fields);
  }
}

export const AMD_TWO_TIER_NETWORK = new NetworkGroup({
  gear: new Generic512TEthernetSwitch(),
  quantity: 0.1875,
  details: [
    ['topology', 'two-tier'],
    ['switches_per_chassis', 0.1875],
  ],
});

export const B300_TWO_TIER_NETWORK = new NetworkGroup({
  gear: new Generic512TEthernetSwitch(),
  quantity: 0.375,
  details: [
    ['topology', 'two-tier'],
    ['switches_per_chassis', 0.375],
  ],
});
