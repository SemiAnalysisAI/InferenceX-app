// SPDX-License-Identifier: GPL-3.0-only
/** System selection shared by the model API and presentation layers. */

import { ValueError } from '../../../base';
import { GPUSystem, type GPUSystemType } from './base';
import {
  B200HGXSystemChassis,
  B300HGXSystemChassis,
  HopperHGXSystemChassis,
  MI300HGXSystemChassis,
  MI325HGXSystemChassis,
  MI355HGXSystemChassis,
} from './hgx';
import { GB200NVL72RackScaleSystem } from './rack_scale/gb200';
import { GB300NVL72RackScaleSystem } from './rack_scale/gb300';

export const SYSTEMS = {
  mi300: MI300HGXSystemChassis,
  mi325: MI325HGXSystemChassis,
  mi355: MI355HGXSystemChassis,
  hopper: HopperHGXSystemChassis,
  b200: B200HGXSystemChassis,
  b300: B300HGXSystemChassis,
  'gb200-nvl72': GB200NVL72RackScaleSystem,
  'gb300-nvl72': GB300NVL72RackScaleSystem,
} as const satisfies Record<string, GPUSystemType>;
export type SystemName = keyof typeof SYSTEMS;

export function system_name(value: string): string {
  const aliases: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(SYSTEMS).map(([name, system]) => [system.typeName.toLowerCase(), name]),
    ),
    h100: 'hopper',
    h200: 'hopper',
    gb200: 'gb200-nvl72',
    gb300: 'gb300-nvl72',
  };
  return aliases[value.toLowerCase()] ?? value.toLowerCase();
}

export function get_system_class(system: string | GPUSystemType): GPUSystemType {
  if (typeof system === 'function' && system.prototype instanceof GPUSystem) return system;
  if (typeof system === 'string' && Object.hasOwn(SYSTEMS, system_name(system))) {
    return SYSTEMS[system_name(system) as SystemName];
  }
  throw new ValueError(`Unknown system: ${typeof system === 'string' ? system : system.typeName}`);
}
