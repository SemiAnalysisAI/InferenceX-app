// SPDX-License-Identifier: GPL-3.0-only
/** Advanced system components and fan relationships. */

export { ComponentGroup, FixedPowerComponent, GenericComponent } from './base';
export { FanPower } from './fan';
export {
  CPU,
  DDR5DIMM,
  FrontendDPU,
  NVMeDrive,
  PCIe4x16Retimer,
  PCIe5x16Retimer,
  PCIeSwitch,
  PEX89144PCIeSwitch,
  SwitchSide800GSR8Transceiver,
  SystemSide400GTransceiver,
  SystemSide800GTransceiver,
  SystemSideTransceiver,
  X86CPU,
} from './generic';
export { AffinityFanPower, HGXFanPolicy, NormalizedHGXFanPower } from './hgx_fans';
export {
  B200PSUEfficiency,
  B300PSUEfficiency,
  HopperPSUEfficiency,
  MI300PSUEfficiency,
  MI325PSUEfficiency,
  MI355PSUEfficiency,
  PSUEfficiencyModel,
  PSUEfficiencyPoint,
} from './psu';
export {
  AMD8WayUBB,
  B200HGXBoard,
  B300HGXBoard,
  BlackwellHGXNVSwitch,
  HopperHGXBoard,
  HopperHGXNVSwitch,
  MI300UBB,
  MI325UBB,
  MI355UBB,
  NVIDIA8WayHGXBoard,
  UniversalBaseBoard,
} from './ubb';
