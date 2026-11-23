import { color } from 'd3';

/**
 * RGBA pixels for a square heatmap, one pixel per cell, with the diagonal left transparent.
 * Drawing the cells as one image instead of n² SVG rects keeps the page DOM small, which
 * every style recalculation (opening a menu, toggling a control) otherwise pays for.
 */
export function heatmapPixels(
  matrix: readonly (readonly number[])[],
  colorOf: (value: number) => string,
): Uint8ClampedArray<ArrayBuffer> {
  const n = matrix.length;
  const pixels = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const rgb = i === j ? null : color(colorOf(matrix[i][j]))?.rgb();
      if (!rgb) continue;
      const at = (i * n + j) * 4;
      pixels[at] = rgb.r;
      pixels[at + 1] = rgb.g;
      pixels[at + 2] = rgb.b;
      pixels[at + 3] = 255;
    }
  }
  return pixels;
}

export function heatmapDataUrl(
  matrix: readonly (readonly number[])[],
  colorOf: (value: number) => string,
): string | null {
  const n = matrix.length;
  const canvas = document.createElement('canvas');
  canvas.width = n;
  canvas.height = n;
  const context = canvas.getContext('2d');
  if (!context || n === 0) return null;
  context.putImageData(new ImageData(heatmapPixels(matrix, colorOf), n, n), 0, 0);
  return canvas.toDataURL();
}
