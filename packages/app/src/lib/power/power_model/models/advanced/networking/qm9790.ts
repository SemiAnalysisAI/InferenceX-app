// SPDX-License-Identifier: GPL-3.0-only

import { Provenance } from '../../../base';
import { NetworkGroup } from './base';
import {
  OpticalScaleOutSwitch,
  type OpticalScaleOutSwitchFields,
  type OpticalSwitchSpec,
} from './optical_switch';

export const QM9790_BASELINE = new Provenance({
  profile_id: 'qm9790-ndr-infiniband-switch',
  version: '1',
  source: 'User-specified model baseline',
  kind: 'assumed',
  input_boundary: 'External switch AC power budget including switch-side optics; excludes PUE',
  assumptions: [
    'QM9790 NDR InfiniBand switch bandwidth is 25.6 Tbit/s.',
    'The switch box uses 600 W idle or 783 W active, excluding separately modeled optics.',
    '32 always-powered 800G SR8 optics use the shared 15 W per-optic assumption.',
    'The box budget includes its cooling and conversion losses; do not add HGX fan/PSU models.',
  ],
});

export class QM9790NDRInfiniBandSwitch extends OpticalScaleOutSwitch {
  static override readonly typeName: string = 'QM9790NDRInfiniBandSwitch';
  static override readonly spec: OpticalSwitchSpec = {
    name: 'QM9790NDRInfiniBandSwitch',
    bandwidth_tbps: 25.6,
    idle_power_w: 600,
    active_power_w: 783,
    optics_count: 32,
    box_name: 'QM9790 switch box',
    protocol: 'NDR InfiniBand',
    switch_provenance: QM9790_BASELINE,
  };

  constructor(fields: OpticalScaleOutSwitchFields = {}) {
    super(QM9790NDRInfiniBandSwitch.spec, fields);
  }
}

export const QM9790_TWO_TIER_NETWORK = new NetworkGroup({
  gear: new QM9790NDRInfiniBandSwitch(),
  quantity: 0.375,
  details: [
    ['topology', 'two-tier'],
    ['switches_per_chassis', 0.375],
  ],
});
