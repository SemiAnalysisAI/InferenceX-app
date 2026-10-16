// SPDX-License-Identifier: GPL-3.0-only
/** Whole Grace memory-pool power from physical DRAM traffic. */

import { type Details, Provenance, validate_watts, ValidationError } from '../../../base';
import { GenericComponent, type GenericComponentFields } from './base';

const LPDDR5X_PROVENANCE = new Provenance({
  profile_id: 'grace-512gb-lpddr5x',
  version: '1',
  kind: 'estimated',
  source: 'https://docs.nvidia.com/dccpu/grace-perf-tuning-guide/power-thermals.html',
  input_boundary: 'Entire 512 GB pool attached to one Grace CPU; excludes regulator losses',
  assumptions: [
    'Published 512 GB / 3200 MHz coefficients; bandwidth is total DRAM GB/s.',
    'Model domain is 0 to 384 GB/s; workload bandwidths are estimates.',
    'Use on GB300 is provisional pending qualification of its memory configuration.',
  ],
});

export class LPDDR5XMemory extends GenericComponent {
  static override readonly typeName: string = 'LPDDR5XMemory';
  readonly capacity_gb: 512;
  readonly frequency_mhz: 3200;
  readonly bandwidth_gbps: number;

  constructor({
    bandwidth_gbps,
    capacity_gb = 512,
    frequency_mhz = 3200,
    provenance = LPDDR5X_PROVENANCE,
  }: GenericComponentFields & {
    bandwidth_gbps: number;
    capacity_gb?: 512;
    frequency_mhz?: 3200;
  }) {
    super({ provenance });
    if (capacity_gb !== 512) throw new ValidationError('Input should be 512');
    if (frequency_mhz !== 3200) throw new ValidationError('Input should be 3200');
    this.capacity_gb = capacity_gb;
    this.frequency_mhz = frequency_mhz;
    this.bandwidth_gbps = validate_watts(bandwidth_gbps);
    if (this.bandwidth_gbps > 384) {
      throw new ValidationError('512 GB LPDDR5X profile supports bandwidth from 0 to 384 GB/s');
    }
  }

  estimate_w(): number {
    const b = this.bandwidth_gbps;
    return validate_watts((-0.0000603 * b * b + 56.2 * b + 3396) / 1000);
  }

  protected override _details(): Details {
    return [
      ['capacity_gb_per_pool', this.capacity_gb],
      ['frequency_mhz', this.frequency_mhz],
      ['bandwidth_gbps', this.bandwidth_gbps],
      ['scope', 'one Grace memory pool'],
    ];
  }

  protected override fields(): Record<string, unknown> {
    return {
      ...super.fields(),
      capacity_gb: this.capacity_gb,
      frequency_mhz: this.frequency_mhz,
      bandwidth_gbps: this.bandwidth_gbps,
    };
  }
}
