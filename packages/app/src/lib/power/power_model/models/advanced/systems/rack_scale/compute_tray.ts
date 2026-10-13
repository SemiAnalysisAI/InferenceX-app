// SPDX-License-Identifier: GPL-3.0-only
/* oxlint-disable max-classes-per-file -- mirrors the upstream Python module, class for class */
/** Four-GPU compute trays, with hardware selection owned by the system models. */

import {
  DEFAULT_OPERATING_STATE,
  FrozenModel,
  PowerComponentBreakdown,
  Provenance,
  sum_watts,
  validate_instance,
  ValidationError,
} from '../../../../base';
import type { BiancaBoard } from '../../components/bianca/bianca';
import { GB200BiancaBoard } from '../../components/bianca/gb200';
import { GB300BiancaBoard } from '../../components/bianca/gb300';
import { compute_tray_converter, type DCConverterAssembly } from '../../components/dc_converter';
import {
  NVMeDrive,
  SystemSide400GTransceiver,
  SystemSide800GTransceiver,
  type SystemSideTransceiverType,
} from '../../components/generic';
import { RackFanAssembly, solve_cooling } from '../../components/rack_fans';
import { ConnectX7NICCard } from '../../components/scaleoutnic/connectx7';
import { ConnectX8NICCard } from '../../components/scaleoutnic/connectx8';
import type { ScaleOutNICCardType } from '../../components/scaleoutnic/nic';
import type { SystemEstimateOptions } from '../base';

const NVL72_COMPUTE_TRAY = new Provenance({
  profile_id: 'nvl72-compute-tray',
  version: '2',
  kind: 'estimated',
  source: 'User-specified tray inventory and shared engineering thermal profile',
  input_boundary: 'One compute-tray 48 V-class bus input; excludes rack AC/DC and PUE',
  assumptions: [
    'Two Bianca boards, four NICs and optics, eight NVMe drives and eight fan modules.',
    'One 48 V-class converter serves the complete tray; 8 kW sizing is provisional.',
    'CPU/GPU chip heat goes to liquid; memory, NICs, optics, drives and losses go to air.',
    '500 W air-load fan anchor is shared by GB200 and GB300; OEM coverage may differ.',
    'Additional OEM DPUs, BMCs and boot devices outside this selected BoM are not modeled.',
  ],
});

export interface ComputeTrayFields {
  board: BiancaBoard;
  fans?: RackFanAssembly;
  converter?: DCConverterAssembly;
  provenance?: Provenance;
}

export abstract class ComputeTray extends FrozenModel {
  static override readonly typeName: string = 'ComputeTray';
  static readonly nic_type: ScaleOutNICCardType;
  static readonly optic_type: SystemSideTransceiverType;
  static readonly board_count: number = 2;
  static readonly nic_count: number = 4;
  static readonly nvme_count: number = 8;
  readonly board: BiancaBoard;
  readonly fans: RackFanAssembly;
  readonly converter: DCConverterAssembly;
  readonly provenance: Provenance;

  constructor({
    board,
    fans = new RackFanAssembly({ fan_count: 8, design_air_heat_w: 500 }),
    converter = compute_tray_converter(),
    provenance = NVL72_COMPUTE_TRAY,
  }: ComputeTrayFields) {
    super();
    this.board = board;
    this.fans = fans;
    this.converter = converter;
    this.provenance = provenance;
    if (this.fans.fan_count !== 8) {
      throw new ValidationError('A compute tray must contain exactly eight fan modules');
    }
  }

  estimate_breakdown(
    gpu_level_power_per_gpu: number,
    {
      cpu_and_dram_measured_power_per_socket = null,
      operating_state = DEFAULT_OPERATING_STATE,
    }: SystemEstimateOptions = {},
  ): PowerComponentBreakdown {
    const tray = this.constructor as typeof ComputeTray;
    const state = operating_state;
    const board = this.board.estimate_breakdown(gpu_level_power_per_gpu, {
      cpu_and_dram_measured_power_per_socket,
      operating_state: state,
    });
    const nics = new tray.nic_type({ state: state.nic_state })
      .estimate_breakdown()
      .scaled(tray.nic_count);
    const optics = new tray.optic_type().estimate_breakdown().scaled(tray.nic_count);
    const drives = new NVMeDrive().estimate_breakdown().scaled(tray.nvme_count);
    const components = [board.scaled(tray.board_count), nics, optics, drives];
    const load = sum_watts(components.map((component) => component.power_w));
    const air = sum_watts([
      tray.board_count * (board.detail('air_heat_w') as number),
      nics.power_w,
      optics.power_w,
      drives.power_w,
    ]);
    const fans = solve_cooling(load, air, this.fans, (output) => this.converter.loss_w(output));
    const loss = this.converter.estimate_loss_breakdown(load + fans.power_w);
    return PowerComponentBreakdown.group(this.typeName, [...components, fans, loss], {
      provenance: this.provenance,
      details: [
        ['gpu_count_per_tray', 4],
        ['dc_component_power_w', load],
      ],
    });
  }

  protected fields() {
    return {
      board: this.board,
      fans: this.fans,
      converter: this.converter,
      provenance: this.provenance,
    };
  }
}

export class GB200ComputeTray extends ComputeTray {
  static override readonly typeName: string = 'GB200ComputeTray';
  static override readonly nic_type: ScaleOutNICCardType = ConnectX7NICCard;
  static override readonly optic_type: SystemSideTransceiverType = SystemSide400GTransceiver;

  constructor({ board = new GB200BiancaBoard(), ...rest }: Partial<ComputeTrayFields> = {}) {
    super({ board: validate_instance(board, GB200BiancaBoard), ...rest });
  }
}

export class GB300ComputeTray extends ComputeTray {
  static override readonly typeName: string = 'GB300ComputeTray';
  static override readonly nic_type: ScaleOutNICCardType = ConnectX8NICCard;
  static override readonly optic_type: SystemSideTransceiverType = SystemSide800GTransceiver;

  constructor({ board = new GB300BiancaBoard(), ...rest }: Partial<ComputeTrayFields> = {}) {
    super({ board: validate_instance(board, GB300BiancaBoard), ...rest });
  }
}
