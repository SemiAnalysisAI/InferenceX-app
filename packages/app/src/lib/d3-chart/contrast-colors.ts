function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

let _probeCtx: CanvasRenderingContext2D | null = null;

function parseRgb(color: string): [number, number, number] | null {
  if (!_probeCtx) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    _probeCtx = canvas.getContext('2d', { willReadFrequently: true });
    if (!_probeCtx) return null;
  }
  _probeCtx.clearRect(0, 0, 1, 1);
  _probeCtx.fillStyle = color;
  _probeCtx.fillRect(0, 0, 1, 1);
  const [r, g, b] = _probeCtx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

export function contrastColors(bgColor: string): string {
  let resolved = bgColor;
  if (bgColor.startsWith('var(')) {
    const varName = bgColor.slice(4, -1).trim();
    resolved = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }
  const rgb = parseRgb(resolved);
  if (!rgb) return 'white';
  const lum = relativeLuminance(...rgb);
  return lum > 0.3 ? '#131416' : 'white';
}
