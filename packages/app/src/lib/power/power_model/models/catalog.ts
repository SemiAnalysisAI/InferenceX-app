// SPDX-License-Identifier: GPL-3.0-only
/** Public construction of a power model from scenario inputs. */

import { type PowerModel, ValueError, WorkloadState } from '../base';
import { OSSAllinPowerModel } from './advanced/model';
import type { GPUSystemType } from './advanced/systems/base';
import { get_system_class } from './advanced/systems/catalog';
import { ExamplePowerModel } from './example';

export const MODELS = { oss: OSSAllinPowerModel, example: ExamplePowerModel } as const;

export function model_name(value: string): string {
  const aliases: Record<string, string> = Object.fromEntries(
    Object.entries(MODELS).map(([name, model]) => [model.typeName.toLowerCase(), name]),
  );
  return aliases[value.toLowerCase()] ?? value.toLowerCase();
}

export interface CreatePowerModelOptions {
  system: string | GPUSystemType;
  model?: string;
  workload_state?: WorkloadState | string;
  using_scale_out?: boolean;
  systems?: number;
}

export function create_power_model({
  system,
  model = 'oss',
  workload_state = WorkloadState.FIXED_SEQ_LEN,
  using_scale_out = false,
  systems = 1,
}: CreatePowerModelOptions): PowerModel {
  const selected = model_name(model);
  if (!Object.hasOwn(MODELS, selected)) throw new ValueError(`Unknown model: ${model}`);
  const system_class = get_system_class(system);
  if (selected === 'example') {
    return new ExamplePowerModel({
      cooling: system_class.default_cooling,
      workload_state,
      using_scale_out,
    });
  }
  return OSSAllinPowerModel.for_system(system_class, {
    workload_state,
    using_scale_out,
    systems,
  });
}
