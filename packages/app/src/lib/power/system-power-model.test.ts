import { describe, expect, it } from 'vitest';

import { create_power_model, type PowerEstimate, ValueError } from './power_model';
import { SYSTEMS } from './power_model/models/advanced/systems/catalog';
import {
  AIR_COOLED_SYSTEM_PUE,
  FACILITY_PUE_NOTE,
  formatPueRange,
  LIQUID_COOLED_RACK_PUE,
} from './facility-pue';
import {
  estimateChassisPower,
  estimateRackPower,
  isRackPowerHardware,
  isSystemPowerHardware,
  rackComputeTrayCount,
  SYSTEM_POWER_CATEGORIES,
  SYSTEM_POWER_MODEL_REVISION,
  SYSTEM_POWER_MODEL_SOURCE_URL,
  systemPowerLeafCategory,
  type SystemPowerCategory,
  type SystemPowerOperatingState,
} from './system-power-model';
import type { PowerComponentBreakdown } from './power_model/base';

const STATE = { workload: 'agentic', scaleOut: true } as const;

function upstream(system: string, gpuWattsPerGpu: number, socketWatts: number | null = null) {
  const estimate = create_power_model({
    system,
    workload_state: STATE.workload,
    using_scale_out: STATE.scaleOut,
  }).estimate_breakdown(gpuWattsPerGpu, { cpu_and_dram_measured_power_per_socket: socketWatts });
  return {
    itWatts: estimate.it_power_w,
    facilityWatts: estimate.facility_power_w,
    pue: estimate.pue,
  };
}

function fresh(
  system: string,
  gpuWattsPerGpu: number,
  socketWatts: number | null,
  state: SystemPowerOperatingState,
) {
  let estimate: PowerEstimate;
  try {
    estimate = create_power_model({
      system,
      workload_state: state.workload,
      using_scale_out: state.scaleOut,
    }).estimate_breakdown(gpuWattsPerGpu, {
      cpu_and_dram_measured_power_per_socket: socketWatts,
    });
  } catch (error) {
    if (error instanceof ValueError) return null;
    throw error;
  }
  const breakdown = Object.fromEntries(SYSTEM_POWER_CATEGORIES.map((key) => [key, 0]));
  const visit = (top: PowerComponentBreakdown, component: PowerComponentBreakdown) => {
    if (component.children.length === 0) {
      breakdown[systemPowerLeafCategory(top.name, component.name)] += component.power_w;
      return;
    }
    for (const child of component.children) visit(top, child);
  };
  for (const top of estimate.components) visit(top, top);
  breakdown.facility = estimate.facility_overhead_w;
  return {
    itWatts: estimate.it_power_w,
    facilityWatts: estimate.facility_power_w,
    pue: estimate.pue,
    breakdown,
  };
}

describe('system power model adapter', () => {
  it('pins the ported upstream revision', () => {
    expect(SYSTEM_POWER_MODEL_REVISION).toMatch(/^[0-9a-f]{40}$/);
    expect(SYSTEM_POWER_MODEL_SOURCE_URL).toContain(SYSTEM_POWER_MODEL_REVISION);
  });

  it.each([
    ['h100', 'hopper'],
    ['h200', 'hopper'],
    ['b200', 'b200'],
    ['b300', 'b300'],
    ['mi300x', 'mi300'],
    ['mi325x', 'mi325'],
    ['mi355x', 'mi355'],
  ] as const)(
    'models %s as the upstream %s chassis at chassis GPU watts / 8',
    (hardware, system) => {
      expect(isSystemPowerHardware(hardware)).toBe(true);
      expect(estimateChassisPower(hardware, 8 * 612.5, null, STATE)).toMatchObject(
        upstream(system, 612.5),
      );
    },
  );

  it.each([
    ['gb200', 'gb200-nvl72'],
    ['gb300', 'gb300-nvl72'],
  ] as const)(
    'models %s as the upstream %s rack, measured or modeled Grace',
    (hardware, system) => {
      expect(isRackPowerHardware(hardware)).toBe(true);
      expect(isSystemPowerHardware(hardware)).toBe(false);
      expect(estimateRackPower(hardware, 900, 98.066, STATE)).toMatchObject(
        upstream(system, 900, 98.066),
      );
      expect(estimateRackPower(hardware, 900, null, STATE)).toMatchObject(upstream(system, 900));
      expect(rackComputeTrayCount(hardware)).toBe(18);
    },
  );

  /** Every leaf the pinned port produces, across every supported system and state. */
  const PINNED_LEAVES: Record<string, SystemPowerCategory> = {
    GPUs: 'gpu',
    'Grace socket (measured)': 'measuredCpu',
    CPU: 'measuredCpu',
    X86CPU: 'cpu',
    GraceCPU: 'cpu',
    DDR5DIMM: 'memory',
    LPDDR5XMemory: 'memory',
    ConnectX7NICCard: 'nic',
    ConnectX8NICCard: 'nic',
    Thor2NICCard: 'nic',
    PollaraNICCard: 'nic',
    SystemSide400GTransceiver: 'nic',
    SystemSide800GTransceiver: 'nic',
    HopperHGXNVSwitch: 'nvswitch',
    BlackwellHGXNVSwitch: 'nvswitch',
    BlackwellNVSwitch: 'nvswitch',
    EPYCEmbedded3151CPU: 'nvswitch',
    NVMeDrive: 'storage',
    PCIe5x16Retimer: 'other',
    PEX89144PCIeSwitch: 'other',
    'Shelf controller': 'other',
    FanPower: 'fans',
    'Fan module': 'fans',
    'Power conversion losses': 'psuLoss',
    'DC/DC converter loss': 'psuLoss',
    'AC/DC conversion loss': 'psuLoss',
  };
  const SCALE_OUT_LEAVES = [
    'QM9700 switch box',
    'QM9790 switch box',
    'Generic 51.2T Ethernet switch ASIC',
    'SwitchSide800GSR8Transceiver',
  ];

  it('maps every leaf of every supported system to a named part', () => {
    const seen = new Map<string, Set<string>>();
    const visit = (top: string, component: PowerComponentBreakdown) => {
      if (component.children.length === 0) {
        const tops = seen.get(component.name) ?? new Set<string>();
        tops.add(top);
        seen.set(component.name, tops);
        return;
      }
      for (const child of component.children) visit(top, child);
    };
    const systems = [
      'hopper',
      'b200',
      'b300',
      'mi300',
      'mi325',
      'mi355',
      'gb200-nvl72',
      'gb300-nvl72',
    ];
    const workloads = ['fixed-seq-len', 'agentic', 'agentic-cpu-offloading'] as const;
    for (const system of systems) {
      for (const workload of workloads) {
        for (const scaleOut of [false, true]) {
          const measured = system.startsWith('gb')
            ? { cpu_and_dram_measured_power_per_socket: 98.066 }
            : { cpu_measured_power_per_socket: 210.25 };
          for (const socket of [{}, measured]) {
            const estimate = create_power_model({
              system,
              workload_state: workload,
              using_scale_out: scaleOut,
            }).estimate_breakdown(700, socket);
            for (const top of estimate.components) visit(top.name, top);
          }
        }
      }
    }
    const leaves = Object.fromEntries(
      [...seen]
        .filter(([, tops]) => !tops.has('Scale-out networking'))
        .map(([name, tops]) => [name, systemPowerLeafCategory([...tops][0], name)]),
    );
    expect(leaves).toEqual(PINNED_LEAVES);
    expect(
      [...seen].filter(([, tops]) => tops.has('Scale-out networking')).map(([name]) => name),
    ).toEqual(expect.arrayContaining(SCALE_OUT_LEAVES));
    for (const name of SCALE_OUT_LEAVES) {
      expect(systemPowerLeafCategory('Scale-out networking', name)).toBe('network');
    }
    // A renamed upstream component lands in `other` and fails the table above.
    expect(systemPowerLeafCategory('GPU systems', 'SomethingNew')).toBe('other');
  });

  it('quotes the upstream cooling PUEs', () => {
    expect(AIR_COOLED_SYSTEM_PUE).toBe(SYSTEMS.hopper.default_cooling.pue);
    expect(LIQUID_COOLED_RACK_PUE).toBe(SYSTEMS['gb200-nvl72'].default_cooling.pue);
    expect(new Set(Object.values(SYSTEMS).map((system) => system.default_cooling.pue))).toEqual(
      new Set([AIR_COOLED_SYSTEM_PUE, LIQUID_COOLED_RACK_PUE]),
    );
    expect(AIR_COOLED_SYSTEM_PUE).toBe(estimateChassisPower('b200', 5600, null, STATE)!.pue);
    expect(LIQUID_COOLED_RACK_PUE).toBe(estimateRackPower('gb300', 700, null, STATE)!.pue);
  });

  it('names the PUEs the tutorial and the facility note quote', () => {
    expect(FACILITY_PUE_NOTE).toEqual({
      en: 'Facility = measured IT power × assumed PUE (1.3 air-cooled, 1.1 liquid-cooled).',
      zh: '数据中心功耗 = 实测 IT 功耗 × 假定 PUE（风冷 1.3，液冷 1.1）。',
    });
  });

  it('returns null where the upstream model rejects the input', () => {
    expect(estimateChassisPower('h100', -8, null, STATE)).toBeNull();
    expect(estimateChassisPower('h100', Number.NaN, null, STATE)).toBeNull();
    expect(estimateRackPower('gb200', 700, Number.POSITIVE_INFINITY, STATE)).toBeNull();
    expect(estimateChassisPower('h100', 8 * 2400, null, STATE)).toBeNull();
    expect(estimateRackPower('gb300', 2400, null, STATE)).toBeNull();
  });

  it('rejects unknown hardware names at the type level only', () => {
    expect(isSystemPowerHardware('gb200')).toBe(false);
    expect(isRackPowerHardware('h100')).toBe(false);
    expect(isSystemPowerHardware('constructor')).toBe(false);
  });

  it('reuses each built model without changing any estimate across states and inputs', () => {
    const chassis = [
      ['h100', 'hopper'],
      ['b200', 'b200'],
      ['b300', 'b300'],
      ['mi300x', 'mi300'],
      ['mi325x', 'mi325'],
      ['mi355x', 'mi355'],
    ] as const;
    const racks = [
      ['gb200', 'gb200-nvl72'],
      ['gb300', 'gb300-nvl72'],
    ] as const;
    const states = (['fixed-seq-len', 'agentic', 'agentic-cpu-offloading'] as const).flatMap(
      (workload) => [false, true].map((scaleOut) => ({ workload, scaleOut })),
    );
    let compared = 0;
    for (const watts of [161.75, 612.5, 1010.125, 2400]) {
      for (const state of states) {
        for (const [hardware, system] of chassis) {
          const actual = estimateChassisPower(hardware, 8 * watts, null, state);
          expect(actual, `${hardware} ${watts} W`).toEqual(fresh(system, watts, null, state));
          if (actual) expect(Object.keys(actual.breakdown)).toEqual(SYSTEM_POWER_CATEGORIES);
          compared++;
        }
        for (const [hardware, system] of racks) {
          for (const socket of [null, 98.066]) {
            expect(estimateRackPower(hardware, watts, socket, state), hardware).toEqual(
              fresh(system, watts, socket, state),
            );
            compared++;
          }
        }
      }
    }
    expect(compared).toBe(4 * 6 * (6 + 4));
  });
});

describe('formatPueRange', () => {
  it('shows one PUE, a low–high range across cooling types, or a dash when none', () => {
    expect(formatPueRange([1.3, 1.3])).toBe('1.3');
    expect(formatPueRange([1.3, 1.1, 1.3])).toBe('1.1–1.3');
    expect(formatPueRange([1.1, Number.NaN])).toBe('1.1');
    expect(formatPueRange([])).toBe('—');
  });
});
