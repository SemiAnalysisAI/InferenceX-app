// SPDX-License-Identifier: GPL-3.0-only
/* oxlint-disable max-classes-per-file -- mirrors the upstream Python module, class for class */
/** Complete equipment power and operating-state propagation before facility PUE. */

import {
  DEFAULT_OPERATING_STATE,
  FrozenModel,
  type JsonObject,
  type JsonValue,
  type OperatingState,
  type PowerComponentBreakdown,
  type Provenance,
  validate_count,
} from '../../../base';
import type { CoolingProfile } from '../../../cooling';
import type { NetworkGroup } from '../networking/base';
import { COMPONENT_INPUT } from '../profiles';

function parameters(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(parameters);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'provenance')
        .map(([key, item]) => [key, parameters(item)]),
    );
  }
  return value;
}

/** Export parameters once; provenance belongs to the component result tree. */
export function _profile_parameters(model: FrozenModel): JsonObject {
  return Object.fromEntries(
    Object.entries(model.model_dump())
      .filter(([key]) => key !== 'provenance')
      .map(([key, value]) => [key, parameters(value)]),
  );
}

export interface SystemEstimateOptions {
  /** Watts per Grace socket; systems without Grace ignore it. */
  cpu_and_dram_measured_power_per_socket?: number | null;
  /** Watts per x86 CPU package; systems without x86 CPUs ignore it. */
  cpu_measured_power_per_socket?: number | null;
  operating_state?: OperatingState;
}

export interface GPUSystemFields {
  gpu_count: number;
  provenance?: Provenance;
}

/** A concrete system class: the catalog constructs it with every default. */
export type GPUSystemType = (new () => GPUSystem) & {
  readonly typeName: string;
  readonly default_cooling: CoolingProfile;
};

export abstract class GPUSystem extends FrozenModel {
  static override readonly typeName: string = 'GPUSystem';
  static readonly default_cooling: CoolingProfile;
  static readonly system_unit: string = 'chassis';
  static readonly has_grace_sockets: boolean = false;
  static readonly default_networking: readonly NetworkGroup[] | null = null;
  readonly gpu_count: number;
  readonly provenance: Provenance;

  constructor({ gpu_count, provenance = COMPONENT_INPUT }: GPUSystemFields) {
    super();
    this.gpu_count = validate_count(gpu_count);
    this.provenance = provenance;
  }

  private get type(): typeof GPUSystem {
    return this.constructor as typeof GPUSystem;
  }

  get has_grace_sockets(): boolean {
    return this.type.has_grace_sockets;
  }

  get default_networking(): readonly NetworkGroup[] | null {
    return this.type.default_networking;
  }

  get system_unit(): string {
    return this.type.system_unit;
  }

  /** Hardware family identifier supplied by concrete systems. */
  get system_type(): string {
    return this.typeName;
  }

  /**
   * Evaluate one system without PUE. The measured inputs cover CPU and DRAM,
   * or CPU alone, in watts per socket.
   */
  abstract estimate_it_power(
    gpu_level_power_per_gpu: number,
    options?: SystemEstimateOptions,
  ): PowerComponentBreakdown;

  _configuration(state: OperatingState): JsonObject {
    return {
      ..._profile_parameters(this),
      ...state.model_dump(),
      cpu_offload: state.cpu_offload,
    };
  }

  protected fields(): Record<string, unknown> {
    return { gpu_count: this.gpu_count, provenance: this.provenance };
  }
}

export class SystemGroup extends FrozenModel {
  static override readonly typeName: string = 'SystemGroup';
  readonly system: GPUSystem;
  readonly quantity: number;

  constructor({ system, quantity = 1 }: { system: GPUSystem; quantity?: number }) {
    super();
    this.system = system;
    this.quantity = validate_count(quantity);
  }

  get gpu_count(): number {
    return this.quantity * this.system.gpu_count;
  }

  estimate_it_power(
    gpu_level_power_per_gpu: number,
    {
      cpu_and_dram_measured_power_per_socket = null,
      cpu_measured_power_per_socket = null,
      operating_state = DEFAULT_OPERATING_STATE,
    }: SystemEstimateOptions = {},
  ): PowerComponentBreakdown {
    return this.system
      .estimate_it_power(gpu_level_power_per_gpu, {
        cpu_and_dram_measured_power_per_socket,
        cpu_measured_power_per_socket,
        operating_state,
      })
      .scaled(this.quantity);
  }

  protected fields() {
    return { system: this.system, quantity: this.quantity };
  }
}
