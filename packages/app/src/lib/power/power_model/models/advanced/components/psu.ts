// SPDX-License-Identifier: GPL-3.0-only
/* oxlint-disable max-classes-per-file -- mirrors the upstream Python module, class for class */
/** HGX PSU load sharing, efficiency, and capacity limits. */

import {
  formatG,
  FrozenModel,
  pairs,
  PowerComponentBreakdown,
  Provenance,
  validate_count,
  validate_watts,
  ValidationError,
  ValueError,
} from '../../../base';
import { COMPONENT_INPUT } from '../profiles';

const positivePower = (value: number): number => {
  if (!Number.isFinite(value) || !(value > 0)) {
    throw new ValidationError('Input should be greater than 0');
  }
  return value;
};

function _psu_provenance(family: string): Provenance {
  return new Provenance({
    profile_id: `${family}-psu`,
    version: '1',
    source: 'HGX PSU model baseline',
    kind: 'estimated',
    input_boundary: 'Chassis AC-to-DC PSU conversion loss; DC load includes fans, excludes PUE',
    assumptions: [
      'Efficiency and capacity are modeling assumptions, not measured chassis profiles.',
      'All HGX families use the same Titanium-class efficiency curve, with ' +
        'system-specific PSU counts, load sharing, and capacity limits.',
    ],
  });
}

export class PSUEfficiencyPoint extends FrozenModel {
  static override readonly typeName: string = 'PSUEfficiencyPoint';
  readonly load_fraction: number;
  readonly efficiency: number;

  constructor({ load_fraction, efficiency }: { load_fraction: number; efficiency: number }) {
    super();
    if (!Number.isFinite(load_fraction) || load_fraction < 0 || load_fraction > 1) {
      throw new ValidationError('Input should be between 0 and 1');
    }
    if (!Number.isFinite(efficiency) || !(efficiency > 0) || efficiency > 1) {
      throw new ValidationError('Input should be greater than 0 and at most 1');
    }
    this.load_fraction = load_fraction;
    this.efficiency = efficiency;
  }

  protected fields() {
    return { load_fraction: this.load_fraction, efficiency: this.efficiency };
  }
}

export const TITANIUM_EFFICIENCY_CURVE: readonly PSUEfficiencyPoint[] = (
  [
    [0.05, 0.8864],
    [0.1, 0.9238],
    [0.2, 0.9448],
    [0.5, 0.964],
    [1, 0.9556],
  ] as const
).map(([load_fraction, efficiency]) => new PSUEfficiencyPoint({ load_fraction, efficiency }));

export interface PSUEfficiencyModelFields {
  n_installed_psu: number;
  n_load_sharing_psu: number;
  n_redundant_capacity_psu: number;
  psu_capacity_w: number;
  system_max_w?: number | null;
  redundancy: string;
  efficiency_curve?: readonly PSUEfficiencyPoint[];
  provenance?: Provenance;
}

export class PSUEfficiencyModel extends FrozenModel {
  static override readonly typeName: string = 'PSUEfficiencyModel';
  readonly n_installed_psu: number;
  readonly n_load_sharing_psu: number;
  readonly n_redundant_capacity_psu: number;
  readonly psu_capacity_w: number;
  readonly system_max_w: number | null;
  readonly redundancy: string;
  readonly efficiency_curve: readonly PSUEfficiencyPoint[];
  readonly provenance: Provenance;

  constructor({
    system_max_w = null,
    efficiency_curve = TITANIUM_EFFICIENCY_CURVE,
    provenance = COMPONENT_INPUT,
    ...fields
  }: PSUEfficiencyModelFields) {
    super();
    this.n_installed_psu = validate_count(fields.n_installed_psu);
    this.n_load_sharing_psu = validate_count(fields.n_load_sharing_psu);
    this.n_redundant_capacity_psu = validate_count(fields.n_redundant_capacity_psu);
    this.psu_capacity_w = positivePower(fields.psu_capacity_w);
    this.system_max_w = system_max_w === null ? null : positivePower(system_max_w);
    this.redundancy = fields.redundancy;
    if (efficiency_curve.length < 2) {
      throw new ValidationError('Tuple should have at least 2 items after validation');
    }
    this.efficiency_curve = efficiency_curve;
    this.provenance = provenance;
    if (
      !(
        this.n_redundant_capacity_psu <= this.n_load_sharing_psu &&
        this.n_load_sharing_psu <= this.n_installed_psu
      )
    ) {
      throw new ValidationError('PSU counts must satisfy redundant <= load-sharing <= installed');
    }
    if (
      pairs(efficiency_curve).some(([left, right]) => left.load_fraction >= right.load_fraction)
    ) {
      throw new ValidationError('PSU efficiency load fractions must be strictly increasing');
    }
    validate_watts(this.installed_capacity_w);
  }

  get installed_capacity_w(): number {
    return this.n_installed_psu * this.psu_capacity_w;
  }

  get load_sharing_capacity_w(): number {
    return this.n_load_sharing_psu * this.psu_capacity_w;
  }

  get redundant_capacity_w(): number {
    return this.n_redundant_capacity_psu * this.psu_capacity_w;
  }

  get modeled_capacity_w(): number {
    if (this.system_max_w === null) return this.redundant_capacity_w;
    return Math.min(this.system_max_w, this.redundant_capacity_w);
  }

  efficiency(dc_load_w: number): number {
    const load = validate_watts(dc_load_w);
    if (load > this.modeled_capacity_w) {
      throw new ValueError(
        `DC load ${formatG(load)} W exceeds modeled PSU capacity ` +
          `${formatG(this.modeled_capacity_w)} W (${this.redundancy})`,
      );
    }
    const fraction = load / this.load_sharing_capacity_w;
    const first = this.efficiency_curve[0];
    const last = this.efficiency_curve.at(-1)!;
    if (fraction <= first.load_fraction) return first.efficiency;
    if (fraction >= last.load_fraction) return last.efficiency;
    for (const [left, right] of pairs(this.efficiency_curve)) {
      if (fraction <= right.load_fraction) {
        const weight = (fraction - left.load_fraction) / (right.load_fraction - left.load_fraction);
        return left.efficiency + weight * (right.efficiency - left.efficiency);
      }
    }
    throw new ValueError('PSU efficiency curve does not cover the supplied load');
  }

  estimate_loss_breakdown(dc_load_w: number): PowerComponentBreakdown {
    const load = validate_watts(dc_load_w);
    const efficiency = this.efficiency(load);
    const ac_power = validate_watts(load / efficiency);
    return new PowerComponentBreakdown({
      name: 'Power conversion losses',
      power_w: ac_power - load,
      provenance: this.provenance,
      details: [
        ['model', this.typeName],
        ['dc_load_w_per_system', load],
        ['ac_wall_w_per_system', ac_power],
        ['efficiency', efficiency],
        ['load_sharing_load_fraction', load / this.load_sharing_capacity_w],
        ['load_sharing_capacity_w', this.load_sharing_capacity_w],
        ['redundant_capacity_w', this.redundant_capacity_w],
        ['modeled_capacity_w', this.modeled_capacity_w],
        ['installed_capacity_w', this.installed_capacity_w],
        ['n_installed_psu', this.n_installed_psu],
        ['n_load_sharing_psu', this.n_load_sharing_psu],
        ['redundancy', this.redundancy],
      ],
    });
  }

  protected fields() {
    return {
      n_installed_psu: this.n_installed_psu,
      n_load_sharing_psu: this.n_load_sharing_psu,
      n_redundant_capacity_psu: this.n_redundant_capacity_psu,
      psu_capacity_w: this.psu_capacity_w,
      system_max_w: this.system_max_w,
      redundancy: this.redundancy,
      efficiency_curve: this.efficiency_curve,
      provenance: this.provenance,
    };
  }
}

type PSUDefaults = Partial<PSUEfficiencyModelFields>;

export class HopperPSUEfficiency extends PSUEfficiencyModel {
  static override readonly typeName: string = 'HopperPSUEfficiency';

  constructor(fields: PSUDefaults = {}) {
    super({
      n_installed_psu: 6,
      n_load_sharing_psu: 6,
      n_redundant_capacity_psu: 4,
      psu_capacity_w: 3300,
      redundancy: '4+2',
      provenance: _psu_provenance('hopper'),
      ...fields,
    });
  }
}

export class B200PSUEfficiency extends PSUEfficiencyModel {
  static override readonly typeName: string = 'B200PSUEfficiency';

  constructor(fields: PSUDefaults = {}) {
    super({
      n_installed_psu: 6,
      n_load_sharing_psu: 3,
      n_redundant_capacity_psu: 3,
      psu_capacity_w: 5250,
      redundancy: '3+3',
      provenance: _psu_provenance('b200'),
      ...fields,
    });
  }
}

export class B300PSUEfficiency extends PSUEfficiencyModel {
  static override readonly typeName: string = 'B300PSUEfficiency';

  constructor(fields: PSUDefaults = {}) {
    super({
      n_installed_psu: 12,
      n_load_sharing_psu: 12,
      n_redundant_capacity_psu: 6,
      psu_capacity_w: 3300,
      system_max_w: 15000,
      redundancy: 'N+N / 6+6',
      provenance: _psu_provenance('b300'),
      ...fields,
    });
  }
}

export class MI300PSUEfficiency extends PSUEfficiencyModel {
  static override readonly typeName: string = 'MI300PSUEfficiency';

  constructor(fields: PSUDefaults = {}) {
    super({
      n_installed_psu: 6,
      n_load_sharing_psu: 6,
      n_redundant_capacity_psu: 3,
      psu_capacity_w: 3000,
      system_max_w: 9000,
      redundancy: 'N+N / 3+3',
      provenance: _psu_provenance('amd_oam'),
      ...fields,
    });
  }
}

export class MI325PSUEfficiency extends MI300PSUEfficiency {
  static override readonly typeName: string = 'MI325PSUEfficiency';

  constructor(fields: PSUDefaults = {}) {
    super({ psu_capacity_w: 5250, system_max_w: 15750, ...fields });
  }
}

export class MI355PSUEfficiency extends MI300PSUEfficiency {
  static override readonly typeName: string = 'MI355PSUEfficiency';

  constructor(fields: PSUDefaults = {}) {
    super({
      n_redundant_capacity_psu: 4,
      psu_capacity_w: 6600,
      system_max_w: 26400,
      redundancy: '4+2',
      ...fields,
    });
  }
}
