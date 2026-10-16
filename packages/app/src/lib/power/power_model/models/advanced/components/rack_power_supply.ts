// SPDX-License-Identifier: GPL-3.0-only
/* oxlint-disable max-classes-per-file -- mirrors the upstream Python module, class for class */
/** Parallel Titanium supplies; fans and shelf controls are added before facility PUE. */

import {
  FrozenModel,
  pairs,
  PowerComponentBreakdown,
  Provenance,
  validate_count,
  validate_watts,
  ValidationError,
  ValueError,
} from '../../../base';
import { type PSUEfficiencyPoint, TITANIUM_EFFICIENCY_CURVE } from './psu';
import { RackFanAssembly, solve_cooling } from './rack_fans';

export const SHELF_BASELINE = new Provenance({
  profile_id: 'nvl72-titanium-shelves',
  version: '1',
  kind: 'estimated',
  source: 'Shared Titanium assumption; NVIDIA and Vertiv 33 kW shelf specifications',
  input_boundary: 'Rack AC/DC conversion loss plus shelf fans and controls; excludes PUE',
  assumptions: [
    'Eight shelves, six 5500 W supplies each; four shelves of redundant capacity.',
    'All 48 supplies share load normally; active shelf count can model a feed failure.',
    'The shared project Titanium curve is an assumption, not measured NVL72 efficiency.',
    'One representative fan per PSU and 10 W controls per active shelf are provisional.',
    'Auxiliary wattages are referred to the shelf output, including auxiliary rail conversion.',
    'Unpowered shelves are off; energized standby policies require another profile.',
  ],
});

export interface RackPSUFields {
  capacity_w?: number;
  efficiency_curve?: readonly PSUEfficiencyPoint[];
  fans?: RackFanAssembly;
  provenance?: Provenance;
}

export class RackPSU extends FrozenModel {
  static override readonly typeName: string = 'RackPSU';
  readonly capacity_w: number;
  readonly efficiency_curve: readonly PSUEfficiencyPoint[];
  readonly fans: RackFanAssembly;
  readonly provenance: Provenance;

  constructor({
    capacity_w = 5500,
    efficiency_curve = TITANIUM_EFFICIENCY_CURVE,
    fans = new RackFanAssembly({ fan_count: 1, design_air_heat_w: 250 }),
    provenance = SHELF_BASELINE,
  }: RackPSUFields = {}) {
    super();
    if (!Number.isFinite(capacity_w) || !(capacity_w > 0)) {
      throw new ValidationError('Input should be greater than 0');
    }
    if (efficiency_curve.length < 2) {
      throw new ValidationError('Tuple should have at least 2 items after validation');
    }
    this.capacity_w = capacity_w;
    this.efficiency_curve = efficiency_curve;
    this.fans = fans;
    this.provenance = provenance;
    if (efficiency_curve[0].load_fraction <= 0 || efficiency_curve.at(-1)!.load_fraction !== 1) {
      throw new ValidationError(
        'Rack PSU efficiency curve must cover a positive minimum to full load',
      );
    }
    if (
      pairs(efficiency_curve).some(([left, right]) => left.load_fraction >= right.load_fraction)
    ) {
      throw new ValidationError('PSU load points must be strictly increasing');
    }
  }

  efficiency(output_w: number): number {
    const load = validate_watts(output_w) / this.capacity_w;
    const minimum = this.efficiency_curve[0].load_fraction;
    if (load < minimum) {
      // Python's `{minimum:.0%}`: a whole percentage, rounded half to even.
      throw new ValueError(
        `Rack PSU load below ${percent(minimum)} requires a calibrated low-load profile`,
      );
    }
    if (load > 1) throw new ValueError('Rack PSU output exceeds continuous capacity');
    for (const [left, right] of pairs(this.efficiency_curve)) {
      if (load <= right.load_fraction) {
        const weight = (load - left.load_fraction) / (right.load_fraction - left.load_fraction);
        return left.efficiency + weight * (right.efficiency - left.efficiency);
      }
    }
    throw new ValueError('PSU curve does not cover output');
  }

  conversion_loss_w(output_w: number): number {
    const output = validate_watts(output_w);
    return validate_watts(output * (1 / this.efficiency(output) - 1));
  }

  estimate_overhead(delivered_dc_w: number): PowerComponentBreakdown {
    const fan = solve_cooling(delivered_dc_w, 0, this.fans, (output) =>
      this.conversion_loss_w(output),
    );
    const output = validate_watts(delivered_dc_w + fan.power_w);
    const efficiency = this.efficiency(output);
    const loss = new PowerComponentBreakdown({
      name: 'AC/DC conversion loss',
      power_w: this.conversion_loss_w(output),
      provenance: this.provenance,
    });
    return PowerComponentBreakdown.group('Rack PSU overhead', [loss, fan], {
      provenance: this.provenance,
      details: [
        ['dc_output_w_per_psu', output],
        ['efficiency', efficiency],
        ['load_fraction', output / this.capacity_w],
        ['capacity_w', this.capacity_w],
      ],
    });
  }

  protected fields() {
    return {
      capacity_w: this.capacity_w,
      efficiency_curve: this.efficiency_curve,
      fans: this.fans,
      provenance: this.provenance,
    };
  }
}

function percent(value: number): string {
  const scaled = value * 100;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  const rounded = diff > 0.5 || (diff === 0.5 && floor % 2 === 1) ? floor + 1 : floor;
  return `${rounded}%`;
}

export class PowerShelf extends FrozenModel {
  static override readonly typeName: string = 'PowerShelf';
  readonly psu_count: number;
  readonly psu: RackPSU;
  readonly controller_power_w: number;

  constructor({
    psu_count = 6,
    psu = new RackPSU(),
    controller_power_w = 10,
  }: { psu_count?: number; psu?: RackPSU; controller_power_w?: number } = {}) {
    super();
    this.psu_count = validate_count(psu_count);
    this.psu = psu;
    this.controller_power_w = validate_watts(controller_power_w);
  }

  estimate_overhead(delivered_dc_w: number): PowerComponentBreakdown {
    const load = validate_watts(validate_watts(delivered_dc_w) + this.controller_power_w);
    return PowerComponentBreakdown.group(
      'Power shelf overhead',
      [
        this.psu.estimate_overhead(load / this.psu_count).scaled(this.psu_count),
        new PowerComponentBreakdown({
          name: 'Shelf controller',
          power_w: this.controller_power_w,
          provenance: SHELF_BASELINE,
        }),
      ],
      { provenance: SHELF_BASELINE },
    );
  }

  protected fields() {
    return {
      psu_count: this.psu_count,
      psu: this.psu,
      controller_power_w: this.controller_power_w,
    };
  }
}

export interface RackPowerSupplyFields {
  installed_shelves?: number;
  active_shelves?: number;
  surviving_shelves?: number;
  shelf?: PowerShelf;
  provenance?: Provenance;
}

export class RackPowerSupply extends FrozenModel {
  static override readonly typeName: string = 'RackPowerSupply';
  readonly installed_shelves: number;
  readonly active_shelves: number;
  readonly surviving_shelves: number;
  readonly shelf: PowerShelf;
  readonly provenance: Provenance;

  constructor({
    installed_shelves = 8,
    active_shelves = 8,
    surviving_shelves = 4,
    shelf = new PowerShelf(),
    provenance = SHELF_BASELINE,
  }: RackPowerSupplyFields = {}) {
    super();
    this.installed_shelves = validate_count(installed_shelves);
    this.active_shelves = validate_count(active_shelves);
    this.surviving_shelves = validate_count(surviving_shelves);
    this.shelf = shelf;
    this.provenance = provenance;
    if (
      !(
        this.surviving_shelves <= this.active_shelves &&
        this.active_shelves <= this.installed_shelves
      )
    ) {
      throw new ValidationError('Shelf counts require surviving <= active <= installed');
    }
  }

  get redundant_capacity_w(): number {
    return this.surviving_shelves * this.shelf.psu_count * this.shelf.psu.capacity_w;
  }

  estimate_overhead(rack_bus_w: number): PowerComponentBreakdown {
    const load = validate_watts(rack_bus_w);
    if (load > this.redundant_capacity_w) {
      throw new ValueError('Rack bus load exceeds redundant power-shelf capacity');
    }
    // Check the surviving bank with its own fan load, not the normal operating fan watts.
    const reserve = this.shelf.estimate_overhead(load / this.surviving_shelves);
    const current = this.shelf
      .estimate_overhead(load / this.active_shelves)
      .scaled(this.active_shelves);
    return new PowerComponentBreakdown({
      name: 'Power shelves',
      power_w: current.power_w,
      quantity: current.quantity,
      children: current.children,
      provenance: this.provenance,
      details: [
        ['rack_bus_w', load],
        ['rack_ac_w', load + current.power_w],
        ['installed_shelves', this.installed_shelves],
        ['active_shelves', this.active_shelves],
        ['redundant_capacity_w', this.redundant_capacity_w],
        ['feed_loss_ac_w', load + reserve.power_w * this.surviving_shelves],
      ],
    });
  }

  protected fields() {
    return {
      installed_shelves: this.installed_shelves,
      active_shelves: this.active_shelves,
      surviving_shelves: this.surviving_shelves,
      shelf: this.shelf,
      provenance: this.provenance,
    };
  }
}
