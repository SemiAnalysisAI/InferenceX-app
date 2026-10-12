// SPDX-License-Identifier: GPL-3.0-only
/** One Grace CPU, one 512 GB memory pool, and exactly two GPUs. */

import {
  DEFAULT_OPERATING_STATE,
  FrozenModel,
  type OperatingState,
  PowerComponentBreakdown,
  Provenance,
  validate_watts,
  ValidationError,
} from '../../../../base';
import { GPU_INPUT, GRACE_SOCKET_INPUT } from '../../profiles';
import { GraceCPU, GraceWorkloadProfile } from '../grace_cpu';
import { LPDDR5XMemory } from '../lpddr5x';

const BIANCA_BOARD = new Provenance({
  profile_id: 'bianca-board',
  version: '2',
  kind: 'estimated',
  source: 'User-specified two-GPU / one-Grace / 512 GB board inventory',
  input_boundary: 'Modeled GPU, CPU and memory loads downstream of the compute-tray converter',
  assumptions: [
    'GPU input includes local GPU module regulation but excludes tray DC/DC loss.',
    'One 48 V-class converter belongs to the compute tray; no per-Grace converter.',
    'No separate board-level regulation loss is added to this selected inventory.',
    '512 GB memory is one pool, not power per DIMM or SOCAMM module.',
  ],
});

export interface BiancaBoardFields {
  gpu_count?: number;
  /** Maximum design power of one GPU module; separate from actual input watts. */
  gpu_tdp_w: number;
  workload_profile?: GraceWorkloadProfile;
  provenance?: Provenance;
}

export interface BiancaEstimateOptions {
  cpu_and_dram_measured_power_per_socket?: number | null;
  operating_state?: OperatingState;
}

export abstract class BiancaBoard extends FrozenModel {
  static override readonly typeName: string = 'BiancaBoard';
  static readonly gpu_family: string;
  readonly gpu_count: number;
  readonly gpu_tdp_w: number;
  readonly workload_profile: GraceWorkloadProfile;
  readonly provenance: Provenance;

  constructor({
    gpu_count = 2,
    gpu_tdp_w,
    workload_profile = new GraceWorkloadProfile(),
    provenance = BIANCA_BOARD,
  }: BiancaBoardFields) {
    super();
    if (gpu_count !== 2) throw new ValidationError('A Bianca board contains exactly 2 GPUs');
    if (!Number.isFinite(gpu_tdp_w) || !(gpu_tdp_w > 0)) {
      throw new ValidationError('Input should be greater than 0');
    }
    this.gpu_count = gpu_count;
    this.gpu_tdp_w = gpu_tdp_w;
    this.workload_profile = workload_profile;
    this.provenance = provenance;
  }

  get gpu_family(): string {
    return (this.constructor as typeof BiancaBoard).gpu_family;
  }

  estimate_breakdown(
    gpu_level_power_per_gpu: number,
    {
      cpu_and_dram_measured_power_per_socket = null,
      operating_state = DEFAULT_OPERATING_STATE,
    }: BiancaEstimateOptions = {},
  ): PowerComponentBreakdown {
    const per_gpu = validate_watts(gpu_level_power_per_gpu);
    const state = operating_state;
    const point = this.workload_profile.resolve(state);
    const memory = new LPDDR5XMemory({
      bandwidth_gbps: point.memory_bandwidth_gbps,
    }).estimate_breakdown();
    let grace: PowerComponentBreakdown[];
    if (cpu_and_dram_measured_power_per_socket === null) {
      grace = [
        new GraceCPU({
          power_w: point.cpu_power_w,
          workload_state: state.workload_state,
          provenance: this.workload_profile.provenance,
        }).estimate_breakdown(),
        memory,
      ];
    } else {
      const socket_w = validate_watts(cpu_and_dram_measured_power_per_socket);
      grace = [
        new PowerComponentBreakdown({
          name: 'Grace socket (measured)',
          power_w: socket_w,
          provenance: GRACE_SOCKET_INPUT,
          details: [['cpu_and_dram_measured_power_per_socket', socket_w]],
        }),
      ];
    }
    return PowerComponentBreakdown.group(
      this.typeName,
      [
        new PowerComponentBreakdown({
          name: 'GPUs',
          quantity: 2,
          power_w: 2 * per_gpu,
          provenance: GPU_INPUT,
          details: [
            ['gpu_family', this.gpu_family],
            ['gpu_tdp_w', this.gpu_tdp_w],
            ['gpu_level_power_per_gpu', per_gpu],
            ['input_boundary', 'GPU module, after tray DC/DC'],
          ],
        }),
        ...grace,
      ],
      {
        provenance: this.provenance,
        // GPU and Grace heat is cold-plated; only the modeled LPDDR5X share reaches tray air.
        details: [['air_heat_w', memory.power_w]],
      },
    );
  }

  protected fields() {
    return {
      gpu_count: this.gpu_count,
      gpu_tdp_w: this.gpu_tdp_w,
      workload_profile: this.workload_profile,
      provenance: this.provenance,
    };
  }
}
