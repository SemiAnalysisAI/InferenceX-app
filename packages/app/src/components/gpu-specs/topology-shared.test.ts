import { describe, expect, it } from 'vitest';

import { getVendorColor, linearPositions } from '@/components/gpu-specs/topology-shared';
import type { GpuSpec } from '@/lib/gpu-specs';

// Minimal spec stub — getVendorColor only reads `vendor`.
function specWithVendor(vendor: GpuSpec['vendor']): GpuSpec {
  return { vendor } as GpuSpec;
}

describe('getVendorColor', () => {
  it('returns NVIDIA green for nvidia', () => {
    expect(getVendorColor(specWithVendor('nvidia'))).toBe('#76b900');
  });

  it('returns AMD red for a non-nvidia vendor', () => {
    expect(getVendorColor(specWithVendor('amd'))).toBe('#ed1c24');
  });
});

describe('linearPositions', () => {
  it('returns one position per box', () => {
    expect(linearPositions(4, 0, 10, 2)).toHaveLength(4);
  });

  it('returns an empty array for zero boxes', () => {
    expect(linearPositions(0, 0, 10, 2)).toEqual([]);
  });

  it('places the first box at startX', () => {
    const [first] = linearPositions(3, 5, 20, 4);
    expect(first.x).toBe(5);
    expect(first.cx).toBe(5 + 20 / 2);
  });

  it('advances each box by boxW + gap', () => {
    const boxW = 20;
    const gap = 4;
    const positions = linearPositions(3, 5, boxW, gap);
    expect(positions[1].x).toBe(5 + (boxW + gap));
    expect(positions[2].x).toBe(5 + 2 * (boxW + gap));
  });

  it('centers cx at box left edge + half width', () => {
    const boxW = 50;
    for (const pos of linearPositions(5, 12, boxW, 6)) {
      expect(pos.cx).toBe(pos.x + boxW / 2);
    }
  });

  it('collapses to evenly stacked boxes when gap is zero', () => {
    const positions = linearPositions(3, 0, 10, 0);
    expect(positions.map((p) => p.x)).toEqual([0, 10, 20]);
  });
});
