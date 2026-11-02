import { describe, expect, it } from 'vitest';
import { getPngLayoutSize, PNG_FOOTER_HEIGHT, PNG_PIXEL_RATIO } from './png-layout';

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
      expect(size).toEqual({ width, height });
      expect(size.height).toBeGreaterThanOrEqual(minHeight);
      const captureHeight = size.height - PNG_FOOTER_HEIGHT;
      expect(
        (size.width * PNG_PIXEL_RATIO) /
          (captureHeight * PNG_PIXEL_RATIO + PNG_FOOTER_HEIGHT * PNG_PIXEL_RATIO),
      ).toBe(ratio === '16:9' ? 16 / 9 : 1);
    },
  );
});
