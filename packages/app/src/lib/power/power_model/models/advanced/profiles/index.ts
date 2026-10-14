// SPDX-License-Identifier: GPL-3.0-only
/** Versioned provenance for explicit inputs and the agreed model baselines. */

import { formatG, Provenance } from '../../../base';

export function nic_power_baseline(
  nic_name: string,
  idle_power_w: number,
  active_power_w: number,
): Provenance {
  return new Provenance({
    profile_id: `${nic_name}-state-power`,
    version: '1',
    source: 'User-specified model baseline',
    kind: 'assumed',
    input_boundary: 'One scale-out NIC; excludes separately modeled transceivers and switches',
    assumptions: [
      `Idle power is ${formatG(idle_power_w)} W per card.`,
      `Power when using scale-out networking is ${formatG(active_power_w)} W per card.`,
    ],
  });
}

export function system_side_transceiver_baseline(
  bandwidth_gbps: number,
  power_w: number,
): Provenance {
  return new Provenance({
    profile_id: `system-side-${bandwidth_gbps}g-transceiver`,
    version: '1',
    source: 'User-specified model baseline',
    kind: 'assumed',
    input_boundary: 'One system-side optical transceiver; excludes NIC and switch-side optics',
    assumptions: [
      `Power is ${formatG(power_w)} W per ${bandwidth_gbps} Gbit/s transceiver.`,
      'One transceiver per scale-out NIC, including board-mounted NICs.',
      'Always powered, including when scale-out networking is off.',
    ],
  });
}

export const COMPONENT_INPUT = new Provenance({
  profile_id: 'explicit-component-input',
  version: '1',
  source: 'Caller-supplied component power',
  kind: 'input',
  input_boundary: 'Component electrical input; excludes separately modeled components',
});
export const GPU_INPUT = new Provenance({
  profile_id: 'gpu-input',
  version: '1',
  source: 'gpu_level_power_per_gpu argument',
  kind: 'input',
  input_boundary: 'GPU electrical power, excluding board and host overhead',
});
export const GRACE_SOCKET_INPUT = new Provenance({
  profile_id: 'grace-socket-input',
  version: '1',
  source:
    'cpu_and_dram_measured_power_per_socket argument; ' +
    'ACPI Grace Power Socket average per socket',
  kind: 'measured',
  input_boundary: 'One Grace socket as reported by the ACPI Grace Power Socket sensor',
  assumptions: [
    "Covers CPU and SysIO rails, LPDDR5X and socket regulator loss: inferred from NVIDIA's " +
      'socket-total statement and a ~42 W GB300 remainder above CPU plus SysIO.',
    'GB200 firmware that reported the extra regulator rail only in module power under-reports.',
    'DCGM field 1130 is the CPU rail alone and is not a valid input.',
    'Replaces modeled GraceCPU and LPDDR5XMemory; no Grace-side loss is added.',
    'Assumed downstream of the compute-tray DC/DC converter, which stays modeled.',
    'Tray air takes only the modeled LPDDR5X share; the rest, including regulator loss, is ' +
      'cold-plate heat. Routing all ~42 W to air would add up to ~0.5 kW of rack IT power.',
  ],
});
export const X86_CPU_SOCKET_INPUT = new Provenance({
  profile_id: 'x86-cpu-socket-input',
  version: '1',
  source:
    'cpu_measured_power_per_socket argument; ' +
    'RAPL package-N energy averaged over the window, per socket',
  kind: 'measured',
  input_boundary: 'One x86 CPU package as reported by RAPL; excludes DIMMs',
  assumptions: [
    'Replaces the modeled X86CPU only.',
    'DDR5 DIMMs stay modeled. AMD EPYC RAPL has no DRAM domain; package power excludes DIMMs.',
    'Sits downstream of the PSU, so PSU loss and fan draw respond.',
    'Fan sizing keeps the modeled design-state CPU.',
    'AMD Zen RAPL is not validated against wall power. Schöne et al. (TU Dresden, 2021) found ' +
      'Zen 2 RAPL inaccurate, so treat the value as measured with that caveat.',
  ],
});
export const X86_CPU_AND_DRAM_SOCKET_INPUT = new Provenance({
  profile_id: 'x86-cpu-and-dram-socket-input',
  version: '1',
  source: 'cpu_and_dram_measured_power_per_socket argument',
  kind: 'measured',
  input_boundary: 'One x86 CPU and its attached DDR5 DIMMs, per socket',
  assumptions: ['Replaces modeled X86CPU and DDR5DIMM power.'],
});
export const GRACE_CPU_SOCKET_INPUT = new Provenance({
  profile_id: 'grace-cpu-socket-input',
  version: '1',
  source: 'cpu_measured_power_per_socket argument',
  kind: 'measured',
  input_boundary: 'One Grace CPU without its LPDDR5X memory pool',
  assumptions: ['Replaces modeled GraceCPU power; LPDDR5X remains modeled.'],
});
export const NVME_BASELINE = new Provenance({
  profile_id: 'hgx-idle-nvme',
  version: '1',
  source: 'User-specified model baseline',
  kind: 'assumed',
  input_boundary: 'One NVMe drive',
  assumptions: ['Idle is the only supported state.', 'Idle power is 5 W per drive.'],
});
export const DDR5_BASELINE = new Provenance({
  profile_id: 'ddr5-dimm-offload',
  version: '1',
  source: 'User-specified model baseline',
  kind: 'assumed',
  input_boundary: 'One DDR5 system-memory DIMM; excludes CPU and fan power',
  assumptions: [
    'Idle power is 3.8 W per DIMM.',
    'Active power during CPU offloading is 7 W per DIMM.',
    'The model workload_state determines CPU offloading and the state of all DDR5 DIMMs.',
  ],
});
export const X86_CPU_BASELINE = new Provenance({
  profile_id: 'x86-cpu-state',
  version: '1',
  source: 'User-specified model baseline',
  kind: 'assumed',
  input_boundary: 'One x86 CPU; excludes separately modeled DIMMs and fans',
  assumptions: [
    'Idle power is 80 W per CPU.',
    'FixedSeqLen power is 120 W per CPU.',
    'Agentic power is 150 W per CPU, or 200 W with CPU offloading enabled.',
  ],
});
export const FAN_INPUT = new Provenance({
  profile_id: 'explicit-fan-curve',
  version: '1',
  source: 'Caller-supplied fan relationship',
  kind: 'estimated',
  input_boundary: 'System fans, excluding facility cooling',
});
export const HOPPER_BOARD_BASELINE = new Provenance({
  profile_id: 'hopper-hgx-board',
  version: '1',
  source: 'User-specified model baseline',
  kind: 'assumed',
  input_boundary: 'HGX board; excludes host components, fans, and conversion losses',
  assumptions: [
    'Eight GPUs at the supplied GPU-level power.',
    'Four Hopper HGX NVSwitches and eight PCIe 5.0 x16 retimers.',
  ],
});
export const B200_BOARD_BASELINE = new Provenance({
  profile_id: 'b200-hgx-board',
  version: '1',
  source: 'User-specified model baseline',
  kind: 'assumed',
  input_boundary: 'HGX board; excludes chassis PCIe switches, host components, fans, and losses',
  assumptions: [
    'Eight B200 GPUs at the supplied GPU-level power.',
    'Two Blackwell HGX NVSwitches at 200 W each, rated at 28.8 Tbit/s per switch.',
    'Eight PCIe 5.0 x16 retimers at 12 W each; non-GPU board power totals 496 W.',
  ],
});
export const B300_BOARD_BASELINE = new Provenance({
  profile_id: 'b300-hgx-board',
  version: '1',
  source: 'User-specified model baseline',
  kind: 'assumed',
  input_boundary: 'HGX board including NICs; excludes other host components, fans, and losses',
  assumptions: [
    'Eight B300 GPUs at the supplied GPU-level power.',
    'Two Blackwell HGX NVSwitches at 200 W and 28.8 Tbit/s each.',
    'Eight board-mounted ConnectX-8 NICs: 30 W idle or 50 W active per card.',
    'No PCIe retimers, chassis-level NICs, or chassis PCIe switches in this B300 inventory.',
  ],
});
export const BLACKWELL_NVSWITCH_BASELINE = new Provenance({
  profile_id: 'blackwell-hgx-nvswitch',
  version: '1',
  source: 'User-specified model baseline',
  kind: 'assumed',
  input_boundary: 'One Blackwell HGX NVSwitch',
  assumptions: ['Power is 200 W per switch.', 'Bandwidth is 28.8 Tbit/s per switch.'],
});
export const AMD_UBB_BASELINE = new Provenance({
  profile_id: 'amd-8way-ubb',
  version: '1',
  source: 'User-specified model baseline',
  kind: 'assumed',
  input_boundary: 'AMD UBB; excludes chassis PCIe switches, host components, fans, and losses',
  assumptions: [
    'MI300, MI325, and MI355 boards each contain eight GPUs at the supplied GPU-level power.',
    'Eight PCIe 5.0 x16 retimers at 12 W each; non-GPU board power totals 96 W.',
  ],
});
export const HOPPER_NVSWITCH_BASELINE = new Provenance({
  profile_id: 'hopper-hgx-nvswitch',
  version: '1',
  source: 'User-specified model baseline',
  kind: 'assumed',
  input_boundary: 'One Hopper HGX NVSwitch',
  assumptions: ['Power is 100 W per switch.', 'Bandwidth is 12.8 Tbit/s per switch.'],
});
export const PCIE5_RETIMER_BASELINE = new Provenance({
  profile_id: 'pcie5-x16-retimer',
  version: '1',
  source: 'User-specified model baseline',
  kind: 'assumed',
  input_boundary: 'One PCIe 5.0 x16 retimer',
  assumptions: ['Power is 12 W per retimer.'],
});
export const PEX89144_BASELINE = new Provenance({
  profile_id: 'broadcom-pex89144',
  version: '1',
  source: 'User-specified model baseline',
  kind: 'assumed',
  input_boundary: 'One chassis-owned Broadcom PEX89144 PCIe switch; excludes UBB and fans',
  assumptions: [
    'PCIe 5.0 with 144 lanes.',
    'Always active at 45 W per switch.',
    'Four switches per Hopper, MI300, MI325, MI355, and B200 HGX chassis.',
  ],
});
