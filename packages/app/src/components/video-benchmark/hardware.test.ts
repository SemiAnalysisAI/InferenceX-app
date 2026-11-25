import { describe, expect, it } from 'bun:test';
import { costPerGpuHour, hardwareKey, hardwareLabel, hardwareSort } from './hardware';

describe('video hardware mapping', () => {
  it('maps artifact device names to HW_REGISTRY keys', () => {
    expect(hardwareKey('NVIDIA H100 80GB HBM3')).toBe('h100');
    expect(hardwareKey('NVIDIA H200')).toBe('h200');
    expect(hardwareKey('NVIDIA B200')).toBe('b200');
    expect(hardwareKey('MI355X')).toBe('mi355x');
    expect(hardwareKey('AMD Instinct MI355X OAM')).toBe('mi355x');
    expect(hardwareKey('NVIDIA GB200')).toBe('gb200');
    expect(hardwareKey('A100')).toBe('a100');
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
});
