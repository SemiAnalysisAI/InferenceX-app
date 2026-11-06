function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

let _probeCtx: CanvasRenderingContext2D | null = null;

function resolveCssColor(color: string): string {
  if (!color.startsWith('var(')) return color;
  return getComputedStyle(document.documentElement)
    .getPropertyValue(color.slice(4, -1).trim())
    .trim();
}

function parseRgb(
  color: string,
  opacity: number,
  backdrop: string,
): [number, number, number] | null {
  if (!_probeCtx) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    _probeCtx = canvas.getContext('2d', { willReadFrequently: true });
    if (!_probeCtx) return null;
  }
  _probeCtx.clearRect(0, 0, 1, 1);
  if (opacity < 1) {
    _probeCtx.fillStyle = resolveCssColor(backdrop);
    _probeCtx.fillRect(0, 0, 1, 1);
  }
  _probeCtx.globalAlpha = opacity;
  _probeCtx.fillStyle = color;
  _probeCtx.fillRect(0, 0, 1, 1);
  _probeCtx.globalAlpha = 1;
  const [r, g, b] = _probeCtx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

export function contrastColors(bgColor: string, opacity = 1, backdrop = 'var(--card)'): string {
  const rgb = parseRgb(resolveCssColor(bgColor), opacity, backdrop);
  if (!rgb) return 'white';
  const lum = relativeLuminance(...rgb);
  return lum > 0.3 ? '#131416' : 'white';
}
