// SPDX-License-Identifier: GPL-3.0-only
/* oxlint-disable max-classes-per-file -- mirrors the upstream Python module, class for class */
/** Generic host components; unspecified hardware wattages remain explicit inputs. */

import {
  type Details,
  formatG,
  Provenance,
  validate_count,
  validate_cpu_offload,
  validate_watts,
  ValidationError,
  WorkloadState,
} from '../../../base';
import {
  DDR5_BASELINE,
  NVME_BASELINE,
  PCIE5_RETIMER_BASELINE,
  PEX89144_BASELINE,
  system_side_transceiver_baseline,
  X86_CPU_BASELINE,
} from '../profiles';
import {
  FixedPowerComponent,
  type FixedPowerComponentFields,
  GenericComponent,
  type GenericComponentFields,
} from './base';

export const OPTICS_800G_POWER_W = 15;

type OptionalPower = Omit<FixedPowerComponentFields, 'power_w'> & { power_w?: number };

/** CPU power under the caller's stated component boundary. */
export class CPU extends FixedPowerComponent {
  static override readonly typeName: string = 'CPU';
}

export type X86CPUState = 'Idle' | 'FixedSeqLen' | 'Agentic' | 'AgenticOffloadingOn';

const X86_STATE_POWER_W: Record<X86CPUState, number> = {
  Idle: 80,
  FixedSeqLen: 120,
  Agentic: 150,
  AgenticOffloadingOn: 200,
};

const X86_WORKLOAD_STATE: Record<WorkloadState, X86CPUState> = {
  [WorkloadState.IDLE]: 'Idle',
  [WorkloadState.FIXED_SEQ_LEN]: 'FixedSeqLen',
  [WorkloadState.AGENTIC]: 'Agentic',
  [WorkloadState.AGENTIC_CPU_OFFLOADING]: 'AgenticOffloadingOn',
};

/** One x86 CPU with fixed state power, excluding separately modeled DIMMs. */
export class X86CPU extends CPU {
  static override readonly typeName: string = 'X86CPU';
  static readonly architecture = 'x86';
  readonly state: X86CPUState;

  constructor({
    state,
    provenance = X86_CPU_BASELINE,
    power_w,
  }: OptionalPower & { state: X86CPUState }) {
    if (!Object.hasOwn(X86_STATE_POWER_W, state)) {
      throw new ValidationError(
        "Input should be 'Idle', 'FixedSeqLen', 'Agentic' or 'AgenticOffloadingOn'",
      );
    }
    super({ provenance, power_w: power_w ?? X86_STATE_POWER_W[state] });
    this.state = state;
    if (this.power_w !== X86_STATE_POWER_W[state]) {
      throw new ValidationError(
        `x86 CPU power for ${state} must be ${formatG(X86_STATE_POWER_W[state])} W`,
      );
    }
  }

  static for_workload(workload_state: WorkloadState): X86CPU {
    return new X86CPU({ state: X86_WORKLOAD_STATE[workload_state] });
  }

  protected override _details(): Details {
    return [
      ['architecture', X86CPU.architecture],
      ['state', this.state],
      ['per_cpu_power_w', this.power_w],
    ];
  }

  protected override fields(): Record<string, unknown> {
    return { ...super.fields(), state: this.state };
  }
}

/** One DDR5 DIMM, idle at 3.8 W or active during CPU offloading at 7 W. */
export class DDR5DIMM extends GenericComponent {
  static override readonly typeName: string = 'DDR5DIMM';
  static readonly memory_type = 'DDR5';
  static readonly idle_power_w = 3.8;
  static readonly active_power_w = 7;
  readonly capacity_gb: number;
  readonly state: 'idle' | 'active';

  constructor({
    capacity_gb = 64,
    state = 'idle',
    provenance = DDR5_BASELINE,
  }: GenericComponentFields & { capacity_gb?: number; state?: 'idle' | 'active' } = {}) {
    super({ provenance });
    this.capacity_gb = validate_count(capacity_gb);
    if (state !== 'idle' && state !== 'active') {
      throw new ValidationError("Input should be 'idle' or 'active'");
    }
    this.state = state;
  }

  get power_w(): number {
    return this.state === 'active' ? DDR5DIMM.active_power_w : DDR5DIMM.idle_power_w;
  }

  estimate_w(): number {
    return this.power_w;
  }

  /** Return a validated scenario instance, preserving the original configuration. */
  for_cpu_offload(cpu_offload: boolean): DDR5DIMM {
    const enabled = validate_cpu_offload(cpu_offload);
    return new DDR5DIMM({
      capacity_gb: this.capacity_gb,
      provenance: this.provenance,
      state: enabled ? 'active' : 'idle',
    });
  }

  protected override _details(): Details {
    return [
      ['memory_type', DDR5DIMM.memory_type],
      ['state', this.state],
      ['capacity_gb_per_dimm', this.capacity_gb],
      ['per_dimm_power_w', this.power_w],
      ['idle_power_w', DDR5DIMM.idle_power_w],
      ['active_power_w', DDR5DIMM.active_power_w],
    ];
  }

  protected override fields(): Record<string, unknown> {
    return { ...super.fields(), capacity_gb: this.capacity_gb, state: this.state };
  }
}

/** System-side optics, excluded from external scale-out gear. */
export class SystemSideTransceiver extends FixedPowerComponent {
  static override readonly typeName: string = 'SystemSideTransceiver';
}

/** A system-side transceiver class: constructible with its own baseline defaults. */
export type SystemSideTransceiverType = new () => SystemSideTransceiver;

/** One always-powered 400 Gbit/s optical transceiver at 8 W. */
export class SystemSide400GTransceiver extends SystemSideTransceiver {
  static override readonly typeName: string = 'SystemSide400GTransceiver';
  static readonly bandwidth_gbps = 400;

  constructor({
    power_w = 8,
    provenance = system_side_transceiver_baseline(400, 8),
  }: OptionalPower = {}) {
    super({ power_w, provenance });
    if (this.power_w !== 8) {
      throw new ValidationError('400G system-side transceiver power must be 8 W');
    }
  }

  protected override _details(): Details {
    return [
      ['bandwidth_gbps', SystemSide400GTransceiver.bandwidth_gbps],
      ['per_transceiver_power_w', this.power_w],
      ['power_policy', 'always_on'],
    ];
  }
}

/** One always-powered 800 Gbit/s optical transceiver at 15 W. */
export class SystemSide800GTransceiver extends SystemSideTransceiver {
  static override readonly typeName: string = 'SystemSide800GTransceiver';
  static readonly bandwidth_gbps = 800;

  constructor({
    power_w = OPTICS_800G_POWER_W,
    provenance = system_side_transceiver_baseline(800, OPTICS_800G_POWER_W),
  }: OptionalPower = {}) {
    super({ power_w, provenance });
    if (this.power_w !== OPTICS_800G_POWER_W) {
      throw new ValidationError('800G system-side transceiver power must be 15 W');
    }
  }

  protected override _details(): Details {
    return [
      ['bandwidth_gbps', SystemSide800GTransceiver.bandwidth_gbps],
      ['per_transceiver_power_w', this.power_w],
      ['power_policy', 'always_on'],
    ];
  }
}

const SWITCH_SIDE_800G_SR8_BASELINE = new Provenance({
  profile_id: 'switch-side-800g-sr8-transceiver',
  version: '1',
  source: 'User-specified model baseline; shared 800G optics power assumption',
  kind: 'assumed',
  input_boundary: 'One switch-side optical transceiver; excludes system-side optics',
  assumptions: ['15 W per 800G SR8 optic, always powered in both switch states.'],
});

/** One always-powered switch-side 800G SR8 optic, using the shared 800G power budget. */
export class SwitchSide800GSR8Transceiver extends FixedPowerComponent {
  static override readonly typeName: string = 'SwitchSide800GSR8Transceiver';
  static readonly bandwidth_gbps = 800;

  constructor({
    power_w = OPTICS_800G_POWER_W,
    provenance = SWITCH_SIDE_800G_SR8_BASELINE,
  }: OptionalPower = {}) {
    super({ power_w, provenance });
    if (this.power_w !== OPTICS_800G_POWER_W) {
      throw new ValidationError('800G SR8 switch-side transceiver power must be 15 W');
    }
  }

  protected override _details(): Details {
    return [
      ['bandwidth_gbps', SwitchSide800GSR8Transceiver.bandwidth_gbps],
      ['optical_standard', 'SR8'],
      ['per_transceiver_power_w', this.power_w],
      ['power_policy', 'always_on'],
    ];
  }
}

/** A frontend data processing unit. */
export class FrontendDPU extends FixedPowerComponent {
  static override readonly typeName: string = 'FrontendDPU';
}

/** A PCIe switch that is not already included in the UBB input. */
export class PCIeSwitch extends FixedPowerComponent {
  static override readonly typeName: string = 'PCIeSwitch';
}

/** An always-active Broadcom PCIe 5.0, 144-lane switch at 45 W. */
export class PEX89144PCIeSwitch extends PCIeSwitch {
  static override readonly typeName: string = 'PEX89144PCIeSwitch';
  static readonly vendor = 'Broadcom';
  static readonly part_number = 'PEX89144';
  static readonly pcie_generation = 5;
  static readonly lane_count = 144;
  readonly state: 'active';

  constructor({
    state = 'active',
    power_w = 45,
    provenance = PEX89144_BASELINE,
  }: OptionalPower & { state?: 'active' } = {}) {
    super({ power_w, provenance });
    if (state !== 'active') throw new ValidationError("Input should be 'active'");
    this.state = state;
    if (this.power_w !== 45) {
      throw new ValidationError('PEX89144 active power must be 45 W in model version 0.1');
    }
  }

  protected override _details(): Details {
    return [
      ['vendor', PEX89144PCIeSwitch.vendor],
      ['part_number', PEX89144PCIeSwitch.part_number],
      ['pcie_generation', PEX89144PCIeSwitch.pcie_generation],
      ['lane_count', PEX89144PCIeSwitch.lane_count],
      ['state', this.state],
      ['per_switch_power_w', this.power_w],
    ];
  }

  protected override fields(): Record<string, unknown> {
    return { ...super.fields(), state: this.state };
  }
}

/** A generic PCIe 4.0 x16 retimer with caller-supplied power. */
export class PCIe4x16Retimer extends FixedPowerComponent {
  static override readonly typeName: string = 'PCIe4x16Retimer';
  static readonly pcie_generation = 4;
  static readonly lane_count = 16;

  protected override _details(): Details {
    return [
      ['pcie_generation', PCIe4x16Retimer.pcie_generation],
      ['lane_count', PCIe4x16Retimer.lane_count],
      ['per_retimer_power_w', this.power_w],
    ];
  }
}

/** A generic PCIe 5.0 x16 retimer using the agreed 12 W baseline. */
export class PCIe5x16Retimer extends FixedPowerComponent {
  static override readonly typeName: string = 'PCIe5x16Retimer';
  static readonly pcie_generation = 5;
  static readonly lane_count = 16;

  constructor({ power_w = 12, provenance = PCIE5_RETIMER_BASELINE }: OptionalPower = {}) {
    super({ power_w, provenance });
    if (this.power_w !== 12) {
      throw new ValidationError('PCIe 5.0 x16 retimer power must be 12 W in model version 0.1');
    }
  }

  protected override _details(): Details {
    return [
      ['pcie_generation', PCIe5x16Retimer.pcie_generation],
      ['lane_count', PCIe5x16Retimer.lane_count],
      ['per_retimer_power_w', this.power_w],
    ];
  }
}

export class NVMeDrive extends GenericComponent {
  static override readonly typeName: string = 'NVMeDrive';
  readonly state: 'idle';
  readonly power_w: number;

  constructor({
    state = 'idle',
    power_w = 5,
    provenance = NVME_BASELINE,
  }: GenericComponentFields & { state?: 'idle'; power_w?: number } = {}) {
    super({ provenance });
    if (state !== 'idle') throw new ValidationError("Input should be 'idle'");
    this.state = state;
    this.power_w = validate_watts(power_w);
    if (this.power_w !== 5) {
      throw new ValidationError('NVMe idle power must be 5 W in model version 0.1');
    }
  }

  estimate_w(): number {
    return this.power_w;
  }

  protected override _details(): Details {
    return [
      ['state', this.state],
      ['per_drive_power_w', this.power_w],
    ];
  }

  protected override fields(): Record<string, unknown> {
    return { ...super.fields(), state: this.state, power_w: this.power_w };
  }
}
