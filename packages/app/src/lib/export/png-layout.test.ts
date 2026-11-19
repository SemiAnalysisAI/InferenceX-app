import { describe, expect, it } from 'vitest';
import {
  getPngLayoutSize,
  PNG_FOOTER_HEIGHT,
  PNG_MAX_CANVAS_AREA,
  PNG_MAX_CANVAS_HEIGHT,
  PNG_MIN_PIXEL_RATIO,
  PNG_PIXEL_RATIO,
} from './png-layout';

describe('PNG layout sizes', () => {
  it.each([
    ['16:9', 0, 1280, 720],
    ['1:1', 0, 1000, 1000],
    ['16:9', 850, 1520, 855],
    ['1:1', 1200, 1200, 1200],
  ] as const)(
    'sizes %s around measured chrome of at least %s px',
    (ratio, minHeight, width, height) => {
      const size = getPngLayoutSize(ratio, minHeight);
      expect(size).toEqual({ width, height, pixelRatio: PNG_PIXEL_RATIO });
      expect(size.height).toBeGreaterThanOrEqual(minHeight);
      const captureHeight = size.height - PNG_FOOTER_HEIGHT;
      expect(
        (size.width * PNG_PIXEL_RATIO) /
          (captureHeight * PNG_PIXEL_RATIO + PNG_FOOTER_HEIGHT * PNG_PIXEL_RATIO),
      ).toBe(ratio === '16:9' ? 16 / 9 : 1);
    },
  );

  it.each([
    ['16:9', 600, 700, 1280, 720],
    ['1:1', 600, 900, 1000, 1000],
  ] as const)(
    'keeps %s unchanged when content of %s-%s px fits',
    (ratio, minHeight, contentHeight, width, height) => {
      expect(getPngLayoutSize(ratio, minHeight, contentHeight)).toEqual({
        width,
        height,
        pixelRatio: PNG_PIXEL_RATIO,
      });
    },
  );

  it.each([
    ['16:9', 600, 1500, 1280, 1500],
    ['1:1', 600, 1480, 1000, 1480],
    ['16:9', 850, 1200, 1280, 1200],
    ['16:9', 900, 800, 1280, 900],
  ] as const)(
    'grows %s taller at the ratio width for chrome %s and content %s px',
    (ratio, minHeight, contentHeight, width, height) => {
      expect(getPngLayoutSize(ratio, minHeight, contentHeight)).toEqual({
        width,
        height,
        pixelRatio: PNG_PIXEL_RATIO,
      });
    },
  );

  it('lowers the pixel ratio before the canvas passes browser limits', () => {
    const size = getPngLayoutSize('16:9', 600, 8000);
    expect(size).toEqual({ width: 1280, height: 8000, pixelRatio: 1.25 });
    expect(size.height * size.pixelRatio).toBeLessThanOrEqual(PNG_MAX_CANVAS_HEIGHT);
    expect(size.width * size.height * size.pixelRatio ** 2).toBeLessThanOrEqual(
      PNG_MAX_CANVAS_AREA,
    );
  });

  it.each(['16:9', '1:1'] as const)('caps %s content at the minimum pixel ratio', (ratio) => {
    const size = getPngLayoutSize(ratio, 600, 50_000);
    expect(size.height).toBe(PNG_MAX_CANVAS_HEIGHT / PNG_MIN_PIXEL_RATIO);
    expect(size.pixelRatio).toBe(PNG_MIN_PIXEL_RATIO);
    expect(size.height * size.pixelRatio).toBeLessThanOrEqual(PNG_MAX_CANVAS_HEIGHT);
    expect(size.width * size.height * size.pixelRatio ** 2).toBeLessThanOrEqual(
      PNG_MAX_CANVAS_AREA,
    );
  });
});
