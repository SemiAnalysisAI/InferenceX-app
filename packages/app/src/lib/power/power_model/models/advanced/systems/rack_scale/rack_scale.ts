// SPDX-License-Identifier: GPL-3.0-only
/** Compose fixed NVL72 tray counts and account for rack electrical stages once. */

import {
  DEFAULT_OPERATING_STATE,
  PowerComponentBreakdown,
  Provenance,
  sum_watts,
  validate_watts,
  ValidationError,
} from '../../../../base';
import { CoolingProfile } from '../../../../cooling';
import { RackPowerSupply } from '../../components/rack_power_supply';
import { GPUSystem, type SystemEstimateOptions } from '../base';
import type { ComputeTray } from './compute_tray';
import { NVSwitchTray } from './nvswitch_tray';

const NVL72_RACK = new Provenance({
  profile_id: 'nvl72-rack',
  version: '2',
  kind: 'estimated',
  source: 'Selected NVL72 project BoM',
  input_boundary: 'Rack AC input including tray conversion and power shelves; excludes PUE',
  assumptions: [
    '18 compute trays, 9 switch trays, 72 GPUs, 36 Grace CPUs and 36 memory pools.',
    'This is an estimated selected-inventory profile, not a complete measured OEM rack.',
    'Fan and tray-converter curves are provisional shared assumptions.',
    'Each compute tray has one converter; Bianca boards have no separate conversion stage.',
    'Rack management switches and unspecified OEM auxiliary equipment are outside scope.',
  ],
});

export interface RackScaleSystemFields {
  gpu_count?: number;
  compute_tray_count?: number;
  switch_tray_count?: number;
  compute_tray: ComputeTray;
  switch_tray?: NVSwitchTray;
  power_supply?: RackPowerSupply;
  provenance?: Provenance;
}

const exactly = (value: number, expected: number): number => {
  if (value !== expected) throw new ValidationError(`Input should be ${expected}`);
  return value;
};

export abstract class RackScaleSystem extends GPUSystem {
  static override readonly typeName: string = 'RackScaleSystem';
  static override readonly default_cooling: CoolingProfile = new CoolingProfile({ mode: 'liquid' });
  static override readonly system_unit: string = 'rack';
  static override readonly has_grace_sockets: boolean = true;
  readonly compute_tray_count: number;
  readonly switch_tray_count: number;
  readonly compute_tray: ComputeTray;
  readonly switch_tray: NVSwitchTray;
  readonly power_supply: RackPowerSupply;

  constructor({
    gpu_count = 72,
    compute_tray_count = 18,
    switch_tray_count = 9,
    compute_tray,
    switch_tray = new NVSwitchTray(),
    power_supply = new RackPowerSupply(),
    provenance = NVL72_RACK,
  }: RackScaleSystemFields) {
    super({ gpu_count: exactly(gpu_count, 72), provenance });
    this.compute_tray_count = exactly(compute_tray_count, 18);
    this.switch_tray_count = exactly(switch_tray_count, 9);
    this.compute_tray = compute_tray;
    this.switch_tray = switch_tray;
    this.power_supply = power_supply;
  }

  estimate_it_power(
    gpu_level_power_per_gpu: number,
    {
      cpu_and_dram_measured_power_per_socket = null,
      operating_state = DEFAULT_OPERATING_STATE,
    }: SystemEstimateOptions = {},
  ): PowerComponentBreakdown {
    const per_gpu = validate_watts(gpu_level_power_per_gpu);
    const state = operating_state;
    const compute = this.compute_tray
      .estimate_breakdown(per_gpu, {
        cpu_and_dram_measured_power_per_socket,
        operating_state: state,
      })
      .scaled(this.compute_tray_count);
    const switches = this.switch_tray.estimate_breakdown().scaled(this.switch_tray_count);
    const bus_w = sum_watts([compute.power_w, switches.power_w]);
    const shelves = this.power_supply.estimate_overhead(bus_w);
    return PowerComponentBreakdown.group(this.system_type, [compute, switches, shelves], {
      provenance: this.provenance,
      details: [
        ['gpu_count_per_system', this.gpu_count],
        ['system_unit', 'rack'],
      ],
      configuration: this._configuration(state),
    });
  }

  protected override fields(): Record<string, unknown> {
    return {
      gpu_count: this.gpu_count,
      compute_tray_count: this.compute_tray_count,
      switch_tray_count: this.switch_tray_count,
      compute_tray: this.compute_tray,
      switch_tray: this.switch_tray,
      power_supply: this.power_supply,
      provenance: this.provenance,
    };
  }
}
