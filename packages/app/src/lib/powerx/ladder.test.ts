import { describe, expect, it } from 'vitest';

import {
  buildLadder,
  labelLeft,
  staggerLabels,
  decodeLadderHardware,
  exampleGpuWatts,
  LADDER_HARDWARE,
  loadSweep,
  partGroup,
  snapLoadWatts,
  trackMoves,
} from './ladder';
import { hardwareTdp } from './power-basis';

const cpuWatts = (ladder: NonNullable<ReturnType<typeof buildLadder>>) =>
  ladder.segments.find((segment) => segment.group === 'cpu')!.watts;

describe('buildLadder', () => {
  it('starts solid at the measured GPU watts and ends at IT, then facility, for every chip', () => {
    for (const hardware of LADDER_HARDWARE) {
      const ladder = buildLadder(hardware, 600);
      expect(ladder, hardware).not.toBeNull();
      const [gpu, ...rest] = ladder!.segments;
      expect(gpu).toEqual({ group: 'gpu', kind: 'measured', watts: 600 });
      expect(
        rest.every((segment) => segment.kind === 'modeled'),
        hardware,
      ).toBe(true);
      const modeledSum = rest.reduce((sum, segment) => sum + segment.watts, 0);
      expect(600 + modeledSum, hardware).toBeCloseTo(ladder!.itWatts, 6);
      expect(ladder!.facilityWatts, hardware).toBeCloseTo(ladder!.itWatts * ladder!.pue, 6);
      expect(ladder!.gpusPerMw, hardware).toBeCloseTo(1e6 / ladder!.itWatts, 6);
      expect(ladder!.percentOfTdp, hardware).toBeCloseTo((600 / hardwareTdp(hardware)) * 100, 6);
      expect(ladder!.allInWatts, hardware).toBeGreaterThan(ladder!.tdpWatts);
      for (let i = 2; i < ladder!.segments.length; i++) {
        expect(ladder!.segments[i - 1].watts, hardware).toBeGreaterThanOrEqual(
          ladder!.segments[i].watts,
        );
      }
    }
  });

  it('adds a measured Grace segment on NVL72 when socket watts are supplied', () => {
    const modeled = buildLadder('gb200', 600)!;
    const measured = buildLadder('gb200', 600, 100)!;
    expect(modeled.segments.map((segment) => segment.group)).not.toContain('grace');
    expect(measured.segments[1]).toMatchObject({ group: 'grace', kind: 'measured' });
    expect(measured.segments[1].watts).toBeCloseTo((100 * 36) / 72, 6);
    // The NVSwitch-tray EPYC stays modeled; only the Grace sockets leave the cpu group.
    expect(cpuWatts(measured)).toBeLessThan(cpuWatts(modeled));
    expect(modeled.pue).toBe(1.1);
    expect(buildLadder('b200', 600)!.pue).toBe(1.3);
  });

  it('buckets the port component names', () => {
    expect(partGroup('X86CPU')).toBe('cpu');
    expect(partGroup('GraceCPU')).toBe('cpu');
    expect(partGroup('DDR5DIMM')).toBe('memory');
    expect(partGroup('LPDDR5XMemory')).toBe('memory');
    expect(partGroup('ConnectX7NICCard')).toBe('network');
    expect(partGroup('SwitchSide800GSR8Transceiver')).toBe('network');
    expect(partGroup('QM9790 switch box')).toBe('network');
    expect(partGroup('BlackwellHGXNVSwitch')).toBe('nvswitch');
    expect(partGroup('PEX89144PCIeSwitch')).toBe('pcie');
    expect(partGroup('PCIe5x16Retimer')).toBe('pcie');
    expect(partGroup('NVMeDrive')).toBe('storage');
    expect(partGroup('FanPower')).toBe('fans');
    expect(partGroup('Fan module')).toBe('fans');
    expect(partGroup('Power conversion losses')).toBe('psu');
    expect(partGroup('DC/DC converter loss')).toBe('psu');
    expect(partGroup('Shelf controller')).toBe('other');
  });

  it('labels the example input at 60 % of TDP', () => {
    expect(exampleGpuWatts('b200')).toBe(600);
    expect(exampleGpuWatts('mi355x')).toBe(840);
  });
});

describe('loadSweep', () => {
  it('runs idle to TDP and tells moving parts from flat ones', () => {
    const sweep = loadSweep('b200', 10);
    expect(sweep.gpuWatts).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
    const byGroup = Object.fromEntries(sweep.tracks.map((track) => [track.group, track]));
    expect(byGroup.gpu.kind).toBe('measured');
    expect(byGroup.gpu.values).toEqual(sweep.gpuWatts);
    expect(trackMoves(byGroup.fans.values)).toBe(true);
    expect(trackMoves(byGroup.psu.values)).toBe(true);
    expect(trackMoves(byGroup.cpu.values)).toBe(false);
    expect(trackMoves(byGroup.memory.values)).toBe(false);
    expect(trackMoves(byGroup.network.values)).toBe(false);
    expect(byGroup.fans.values[10]).toBeGreaterThan(byGroup.fans.values[0]);
  });
});

describe('ladder hash codecs', () => {
  it('snaps hardware and watts', () => {
    expect(decodeLadderHardware(null)).toBe('b200');
    expect(decodeLadderHardware('mi355x')).toBe('mi355x');
    expect(decodeLadderHardware('h100')).toBe('b200');
    expect(snapLoadWatts(null, 'b200')).toBe(600);
    expect(snapLoadWatts('250', 'b200')).toBe(250);
    expect(snapLoadWatts('9999', 'b200')).toBe(1000);
    expect(snapLoadWatts('-4', 'b200')).toBe(0);
    expect(snapLoadWatts('x', 'mi355x')).toBe(840);
  });
});

describe('staggerLabels', () => {
  it('keeps separated labels on one row and pushes overlaps down', () => {
    const rows = staggerLabels([
      { key: 'a', x: 0, width: 50, anchor: 'start' },
      { key: 'b', x: 200, width: 50, anchor: 'start' },
      { key: 'c', x: 230, width: 50, anchor: 'middle' },
      { key: 'd', x: 340, width: 50, anchor: 'end' },
    ]);
    expect(rows.get('a')).toBe(0);
    expect(rows.get('b')).toBe(0);
    expect(rows.get('c')).toBe(1);
    expect(rows.get('d')).toBe(0);
    expect(labelLeft({ key: 'x', x: 100, width: 40, anchor: 'end' })).toBe(60);
  });
});
