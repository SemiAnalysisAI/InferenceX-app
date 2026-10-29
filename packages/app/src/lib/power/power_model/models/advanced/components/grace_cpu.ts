// SPDX-License-Identifier: GPL-3.0-only
/* oxlint-disable max-classes-per-file -- mirrors the upstream Python module, class for class */

import {
  type Details,
  FrozenModel,
  type OperatingState,
  parse_workload,
  Provenance,
  validate_watts,
  ValueError,
  WorkloadState,
} from '../../../base';
import { GenericComponent, type GenericComponentFields } from './base';

export const GRACE_BASELINE = new Provenance({
  profile_id: 'grace-workload-baseline',
  version: '1',
  kind: 'estimated',
  source: 'Proposed project workload assignments',
  input_boundary: 'One Grace CPU and SysIO after local regulation; excludes DRAM and losses',
  assumptions: [
    'Fixed sequence / agentic / offloading CPU power is 100 / 140 / 180 W.',
    'Corresponding physical LPDDR traffic is 25 / 50 / 250 GB/s per Grace CPU.',
    'These are scenario assumptions, not measured workload results.',
  ],
});

export class GraceWorkloadPoint extends FrozenModel {
  static override readonly typeName: string = 'GraceWorkloadPoint';
  readonly cpu_power_w: number;
  readonly memory_bandwidth_gbps: number;

  constructor({
    cpu_power_w,
    memory_bandwidth_gbps,
  }: {
    cpu_power_w: number;
    memory_bandwidth_gbps: number;
  }) {
    super();
    this.cpu_power_w = validate_watts(cpu_power_w);
    this.memory_bandwidth_gbps = validate_watts(memory_bandwidth_gbps);
  }

  protected fields() {
    return { cpu_power_w: this.cpu_power_w, memory_bandwidth_gbps: this.memory_bandwidth_gbps };
  }
}

export interface GraceWorkloadProfileFields {
  fixed_seq_len?: GraceWorkloadPoint;
  agentic?: GraceWorkloadPoint;
  agentic_cpu_offloading?: GraceWorkloadPoint;
  idle?: GraceWorkloadPoint | null;
  provenance?: Provenance;
}

export class GraceWorkloadProfile extends FrozenModel {
  static override readonly typeName: string = 'GraceWorkloadProfile';
  readonly fixed_seq_len: GraceWorkloadPoint;
  readonly agentic: GraceWorkloadPoint;
  readonly agentic_cpu_offloading: GraceWorkloadPoint;
  readonly idle: GraceWorkloadPoint | null;
  readonly provenance: Provenance;

  constructor({
    fixed_seq_len = new GraceWorkloadPoint({ cpu_power_w: 100, memory_bandwidth_gbps: 25 }),
    agentic = new GraceWorkloadPoint({ cpu_power_w: 140, memory_bandwidth_gbps: 50 }),
    agentic_cpu_offloading = new GraceWorkloadPoint({
      cpu_power_w: 180,
      memory_bandwidth_gbps: 250,
    }),
    idle = null,
    provenance = GRACE_BASELINE,
  }: GraceWorkloadProfileFields = {}) {
    super();
    this.fixed_seq_len = fixed_seq_len;
    this.agentic = agentic;
    this.agentic_cpu_offloading = agentic_cpu_offloading;
    this.idle = idle;
    this.provenance = provenance;
  }

  resolve(state: OperatingState): GraceWorkloadPoint {
    const point = {
      [WorkloadState.FIXED_SEQ_LEN]: this.fixed_seq_len,
      [WorkloadState.AGENTIC]: this.agentic,
      [WorkloadState.AGENTIC_CPU_OFFLOADING]: this.agentic_cpu_offloading,
      [WorkloadState.IDLE]: this.idle,
    }[state.workload_state];
    if (point === null) {
      throw new ValueError('Grace idle power requires an explicit calibrated workload profile');
    }
    return point;
  }

  protected fields() {
    return {
      fixed_seq_len: this.fixed_seq_len,
      agentic: this.agentic,
      agentic_cpu_offloading: this.agentic_cpu_offloading,
      idle: this.idle,
      provenance: this.provenance,
    };
  }
}

export class GraceCPU extends GenericComponent {
  static override readonly typeName: string = 'GraceCPU';
  readonly power_w: number;
  readonly workload_state: WorkloadState;

  constructor({
    power_w,
    workload_state,
    provenance = GRACE_BASELINE,
  }: GenericComponentFields & { power_w: number; workload_state: WorkloadState }) {
    super({ provenance });
    this.power_w = validate_watts(power_w);
    this.workload_state = parse_workload(workload_state);
  }

  estimate_w(): number {
    return this.power_w;
  }

  protected override _details(): Details {
    return [
      ['architecture', 'Arm'],
      ['workload_state', this.workload_state],
      ['per_cpu_power_w', this.power_w],
    ];
  }

  protected override fields(): Record<string, unknown> {
    return { ...super.fields(), power_w: this.power_w, workload_state: this.workload_state };
  }
}
