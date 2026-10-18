// SPDX-License-Identifier: GPL-3.0-only
/** External network devices and allocations, separate from chassis power. */

export { NetworkGroup, ScaleOutNetworkingGear } from './base';
export {
  AMD_TWO_TIER_NETWORK,
  B300_TWO_TIER_NETWORK,
  Generic512TEthernetSwitch,
} from './ethernet_512t';
export { QM9700NDRInfiniBandSwitch } from './qm9700';
export { QM9790_TWO_TIER_NETWORK, QM9790NDRInfiniBandSwitch } from './qm9790';
