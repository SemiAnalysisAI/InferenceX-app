// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { paintMapBase } from './kart-minimap';
import { SURFACE } from './kart-surface';

afterEach(() => vi.restoreAllMocks());

describe('kart minimap', () => {
  it('includes bank and boost cells in both course bounds and painted pixels', () => {
    const size = 96;
    const image = { data: new Uint8ClampedArray(size * size * 4) };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: () => image,
      putImageData: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    // The new types extend beyond the road at both ends, exercising bounds too.
    const { toMap } = paintMapBase(
      {
        x0: 0,
        z0: 0,
        res: 1,
        width: 6,
        height: 1,
        type: Uint8Array.from([
          SURFACE.bank,
          SURFACE.road,
          SURFACE.curb,
          SURFACE.boost,
          SURFACE.water,
          SURFACE.wall,
        ]),
        y: new Int16Array(6),
      },
      size,
    );
    for (let i = 0; i < 4; i++) {
      const [x, y] = toMap(i + 0.5, 0.5);
      expect(x).toBeGreaterThanOrEqual(8);
      expect(x).toBeLessThan(size - 8);
      const pixel = (Math.floor(y) * size + Math.floor(x)) * 4;
      expect(image.data.slice(pixel, pixel + 4)).toEqual(
        Uint8ClampedArray.from([245, 246, 250, 235]),
      );
    }
    expect(image.data[3]).toBe(0);
  });
});
