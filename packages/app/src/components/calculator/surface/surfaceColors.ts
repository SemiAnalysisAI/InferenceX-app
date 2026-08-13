/**
 * Colour resolution for the surface.
 *
 * 🔴 The trap this exists for: `THREE.Color.setStyle()` cannot parse `oklch()`, and
 * silently yields black when handed one. This repo's palette is oklch — vendor hue
 * zones are generated as oklch strings (`lib/dynamic-colors.ts`) — so passing a
 * chip colour straight to three.js paints every surface black with no error
 * anywhere. Everything therefore goes through a canvas 2d probe first, which
 * resolves any CSS colour the browser understands.
 *
 * The same probe technique already exists, unexported, in
 * `lib/d3-chart/contrast-colors.ts`. Duplicated rather than exported from there
 * because that module is about text contrast and this one is about feeding three.js
 * — but they are the same three lines, and if either changes the other should too.
 */

let probe: CanvasRenderingContext2D | null | undefined;

function probeContext(): CanvasRenderingContext2D | null {
  if (probe !== undefined) return probe;
  if (typeof document === 'undefined') {
    probe = null;
    return probe;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  probe = canvas.getContext('2d', { willReadFrequently: true });
  return probe;
}

/** Any CSS colour (hex, rgb, hsl, oklch, a named colour) as 0..1 RGB. */
export function toLinearHexish(color: string, fallback = '#888888'): string {
  const ctx = probeContext();
  if (!ctx) return fallback;
  try {
    ctx.clearRect(0, 0, 1, 1);
    // An unparseable value leaves fillStyle at its previous value, so reset first:
    // otherwise a bad colour silently inherits the last good one.
    ctx.fillStyle = '#000000';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a === 0) return fallback;
    return `#${[r, g, b].map((c) => (c ?? 0).toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return fallback;
  }
}

/** Split a `#rrggbb` string into components. Avoids hex masks — see the note below. */
function channels(hex: string): [number, number, number] | null {
  if (!/^#[\da-f]{6}$/iu.test(hex)) return null;
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

const toHex = (channelValues: number[]) =>
  `#${channelValues.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

/**
 * Mix toward black — the wireframe drawn over its own fill.
 *
 * Slices the string rather than masking a packed integer because oxfmt lowercases
 * hex literals and oxlint requires them uppercase; the repo has no other hex
 * literals, so there is no settled convention to follow and no reason to add one.
 */
export function darken(hex: string, amount: number): string {
  const parts = channels(hex);
  if (!parts) return hex;
  const scale = Math.max(0, 1 - amount);
  return toHex(parts.map((c) => c * scale));
}

/** Mix toward white, for the isoline that has to read as lit. */
export function lighten(hex: string, amount: number): string {
  const parts = channels(hex);
  if (!parts) return hex;
  const mix = Math.max(0, Math.min(1, amount));
  return toHex(parts.map((c) => c + (255 - c) * mix));
}
