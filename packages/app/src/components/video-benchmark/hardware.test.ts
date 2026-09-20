import { describe, expect, it } from 'vitest';
import {
  costPerGpuHour,
  hardwareKey,
  hardwareLabel,
  hardwareSort,
  VIDEO_HARDWARE_ROSTER,
} from './hardware';

describe('video hardware mapping', () => {
  it('maps artifact device names to HW_REGISTRY keys', () => {
    expect(hardwareKey('NVIDIA H100 80GB HBM3')).toBe('h100');
    expect(hardwareKey('NVIDIA H200')).toBe('h200');
    expect(hardwareKey('NVIDIA B200')).toBe('b200');
    expect(hardwareKey('MI355X')).toBe('mi355x');
    expect(hardwareKey('AMD Instinct MI355X OAM')).toBe('mi355x');
    expect(hardwareKey('NVIDIA GB200')).toBe('gb200');
    expect(hardwareKey('')).toBeNull();
    expect(hardwareKey('Synthetic GPU')).toBeNull();
  });
  it('does not confuse H100 with H1000-style names or MI300X with MI355X', () => {
    expect(hardwareKey('NVIDIA H1000')).toBeNull();
    expect(hardwareKey('AMD Instinct MI300X')).toBe('mi300x');
  });
  it('exposes label, sort and TCO tiers from HW_REGISTRY', () => {
    expect(hardwareLabel('h200')).toBe('H200');
    expect(hardwareLabel('unknown')).toBe('unknown');
    expect(hardwareSort('b200')).toBeLessThan(hardwareSort('h100'));
    expect(costPerGpuHour('h200', 'h')).toBe(1.22);
    expect(costPerGpuHour('h200', 'r')).toBe(2.9);
    expect(costPerGpuHour('unknown', 'h')).toBeNull();
  });
  it('keeps MI355X in the campaign roster as unavailable with its failed run', () => {
    const mi355x = VIDEO_HARDWARE_ROSTER.find((item) => item.key === 'mi355x');
    expect(mi355x?.unavailable?.runUrl).toBe(
      'https://github.com/SemiAnalysisAI/InferenceX/actions/runs/34411615416',
    );
    expect(VIDEO_HARDWARE_ROSTER.map((item) => item.key)).toEqual([
      'b200',
      'mi355x',
      'h200',
      'h100',
    ]);
  });
});
