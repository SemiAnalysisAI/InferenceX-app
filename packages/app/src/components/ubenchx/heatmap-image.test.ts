import { describe, expect, it } from 'bun:test';

import { heatmapPixels } from './heatmap-image';

describe('heatmapPixels', () => {
  it('writes one opaque pixel per off-diagonal cell in row-major order and leaves the diagonal clear', () => {
    const matrix = [
      [0, 1],
      [2, 0],
    ];
    const pixels = heatmapPixels(matrix, (value) => (value === 1 ? '#ff0000' : 'rgb(0, 0, 255)'));
    // Row-major RGBA: diagonal clear, (0,1) red, (1,0) blue, diagonal clear.
    expect([...pixels]).toEqual([0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0]);
  });
});
