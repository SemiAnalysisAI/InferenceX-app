import { describe, expect, it } from 'vitest';

import { SYSTEM_POWER_MODEL_REVISION } from '@/lib/power/system-power-model';

import {
  BASIS_HARDWARE,
  computeBasis,
  decodeBasis,
  defaultBasisSelection,
  encodeBasis,
  hardwareAllInWatts,
  hardwareTdp,
  POWER_MODEL_REVISION,
  POWER_MODEL_SHORT_REVISION,
} from './power-basis';

const switchWatts = (result: ReturnType<typeof computeBasis>) =>
  result.ok ? (result.components.find((c) => /switch box/iu.test(c.name))?.watts ?? 0) : 0;

describe('computeBasis', () => {
  it('reproduces the b200 chassis estimate at 800 W per GPU', () => {
    const result = computeBasis({ ...defaultBasisSelection('b200'), gpuWatts: 800 });
    if (!result.ok) throw new Error('expected an estimate');
    expect(result.gpuCount).toBe(8);
    // create_power_model('b200').estimate_breakdown(800): it 8732.1 W, facility 11351.7 W, PUE 1.3
    expect(result.perGpu.it * 8).toBeCloseTo(8732.1, 1);
    expect(result.perGpu.facility * 8).toBeCloseTo(11351.7, 1);
    expect(result.pue).toBe(1.3);
    expect(result.coolingMode).toBe('air');
    expect(result.perGpu.gpu).toBe(800);
    expect(result.perGpu.allIn).toBe(1710);
    expect(result.percentOfTdp).toBe(80);
    expect(result.gpusPerMw).toBeCloseTo(1e6 / (8732.1 / 8), 0);
  });

  it('lists leaf components sorted by watts with only the GPUs measured', () => {
    const result = computeBasis({ ...defaultBasisSelection('b200'), gpuWatts: 800 });
    if (!result.ok) throw new Error('expected an estimate');
    const [first] = result.components;
    expect(first).toMatchObject({ name: 'GPUs', quantity: 8, watts: 6400, measured: true });
    expect(result.components.filter((component) => component.measured)).toHaveLength(1);
    const watts = result.components.map((component) => component.watts);
    expect(watts).toEqual(watts.toSorted((a, b) => b - a));
    const shares = result.components.reduce((sum, component) => sum + component.shareOfIt, 0);
    expect(shares).toBeCloseTo(1, 6);
    expect(result.components.map((component) => component.name)).toContain('FanPower');
  });

  it('charges the scale-out share more for multi-node and the agentic states more than fixed', () => {
    const base = { ...defaultBasisSelection('h100'), gpuWatts: 400 };
    const single = computeBasis(base);
    const multi = computeBasis({ ...base, deployment: 'multi' });
    const agentic = computeBasis({ ...base, workload: 'agentic-offload' });
    if (!single.ok || !multi.ok || !agentic.ok) throw new Error('expected estimates');
    expect(switchWatts(single)).toBeGreaterThan(0);
    expect(switchWatts(multi)).toBeGreaterThan(switchWatts(single));
    expect(multi.perGpu.it).toBeGreaterThan(single.perGpu.it);
    expect(agentic.perGpu.it).toBeGreaterThan(single.perGpu.it);
  });

  it('treats a measured Grace socket on NVL72 as a measured component', () => {
    const modeled = computeBasis({ ...defaultBasisSelection('gb200'), gpuWatts: 900 });
    const measured = computeBasis({
      ...defaultBasisSelection('gb200'),
      gpuWatts: 900,
      grace: 'measured',
      graceWatts: 100,
    });
    if (!modeled.ok || !measured.ok) throw new Error('expected estimates');
    expect(modeled.gpuCount).toBe(72);
    expect(modeled.pue).toBe(1.1);
    expect(modeled.coolingMode).toBe('liquid');
    expect(modeled.components.find((c) => c.name === 'GraceCPU')?.measured).toBe(false);
    const grace = measured.components.find((c) => c.name === 'Grace socket (measured)');
    expect(grace).toMatchObject({ quantity: 36, watts: 3600, measured: true });
    expect(measured.components.filter((c) => c.measured)).toHaveLength(2);
  });

  it('ignores the Grace input on chassis systems and computes every listed hardware', () => {
    for (const hardware of BASIS_HARDWARE) {
      const selection = { ...defaultBasisSelection(hardware), grace: 'measured' as const };
      const result = computeBasis(selection);
      expect(result.ok, hardware).toBe(true);
      expect(hardwareTdp(hardware)).toBeGreaterThan(0);
      expect(hardwareAllInWatts(hardware)).toBeGreaterThan(hardwareTdp(hardware));
    }
  });

  it('reports the model domain error instead of throwing', () => {
    expect(computeBasis({ ...defaultBasisSelection('b200'), gpuWatts: Number.NaN })).toEqual({
      ok: false,
      reason: 'out-of-range',
    });
    expect(computeBasis({ ...defaultBasisSelection('b200'), gpuWatts: -5 })).toEqual({
      ok: false,
      reason: 'out-of-range',
    });
  });

  it('exposes the pinned power_model revision', () => {
    expect(POWER_MODEL_REVISION).toBe(SYSTEM_POWER_MODEL_REVISION);
    expect(POWER_MODEL_SHORT_REVISION).toBe(SYSTEM_POWER_MODEL_REVISION.slice(0, 7));
  });
});

describe('basis hash codec', () => {
  it('round-trips chassis and rack selections', () => {
    const chassis = {
      ...defaultBasisSelection('mi355x'),
      workload: 'agentic' as const,
      gpuWatts: 910,
    };
    expect(encodeBasis(chassis)).toBe('mi355x_agentic_single_910');
    expect(decodeBasis(encodeBasis(chassis))).toEqual(chassis);
    const rack = {
      ...defaultBasisSelection('gb300'),
      deployment: 'multi' as const,
      gpuWatts: 1000,
      grace: 'measured' as const,
      graceWatts: 250,
    };
    expect(encodeBasis(rack)).toBe('gb300_fixed_multi_1000_measured_250');
    expect(decodeBasis(encodeBasis(rack))).toEqual(rack);
  });

  it('snaps invalid values to defaults and watts into the TDP range', () => {
    expect(decodeBasis(null)).toEqual(defaultBasisSelection('b200'));
    expect(decodeBasis('vr200_fixed_single_900')).toEqual({
      ...defaultBasisSelection('b200'),
      gpuWatts: 900,
    });
    expect(decodeBasis('h100_bogus_bogus_9999')).toEqual({
      ...defaultBasisSelection('h100'),
      gpuWatts: 700,
    });
    expect(decodeBasis('b200').gpuWatts).toBe(600);
  });
});
