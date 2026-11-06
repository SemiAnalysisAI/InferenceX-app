/**
 * Measured geometry of each supporter logo, used to give square marks and long
 * wordmarks a balanced optical size on the logo wall.
 *
 * - `ratio`: intrinsic width / height of the image file.
 * - `aspect`: width / height of the visible (non-transparent) artwork.
 * - `fill`: share of the image height the artwork occupies (1 = no padding).
 * - `invertInDark`: artwork is mostly black/dark grey, so it is flipped to light
 *   in dark mode (hue-preserving, so brand accents keep their color family).
 *
 * Values were measured by drawing each file to a canvas and taking the bounding
 * box of opaque pixels. Add an entry when adding a logo to `public/logos/`.
 */
export interface LogoMetrics {
  ratio: number;
  aspect: number;
  fill: number;
  invertInDark?: boolean;
}

export const LOGO_METRICS: Record<string, LogoMetrics> = {
  'adaptive-ml.svg': { ratio: 6.383, aspect: 6.76, fill: 0.94, invertInDark: true },
  'amd.svg': { ratio: 3.704, aspect: 4.15, fill: 0.69, invertInDark: true },
  'anyscale.svg': { ratio: 4.128, aspect: 4.12, fill: 1, invertInDark: true },
  'baseten.svg': { ratio: 1, aspect: 1, fill: 1 },
  'core42.webp': { ratio: 2.254, aspect: 3.23, fill: 0.56, invertInDark: true },
  'coreweave.svg': { ratio: 1.393, aspect: 1.75, fill: 0.67, invertInDark: true },
  'crusoe.svg': { ratio: 4.189, aspect: 4.22, fill: 0.99, invertInDark: true },
  'datologyai.svg': { ratio: 0.876, aspect: 0.88, fill: 1, invertInDark: true },
  'deepseek-color.svg': { ratio: 1, aspect: 1.36, fill: 0.73 },
  'doubleword.png': { ratio: 4.524, aspect: 4.56, fill: 0.99, invertInDark: true },
  'embeddedllm.webp': { ratio: 3.871, aspect: 3.92, fill: 0.99, invertInDark: true },
  'fireworks.svg': { ratio: 2.025, aspect: 2.025, fill: 1 },
  'firmus.svg': { ratio: 3.808, aspect: 4.04, fill: 0.94, invertInDark: true },
  'gmi-cloud.svg': { ratio: 3.571, aspect: 3.67, fill: 0.78, invertInDark: true },
  'google-color.svg': { ratio: 1, aspect: 0.98, fill: 1 },
  'gpu-mode.png': { ratio: 1.831, aspect: 2.06, fill: 0.8, invertInDark: true },
  'huggingface.svg': { ratio: 1, aspect: 1.08, fill: 0.69 },
  'kimi-color.svg': { ratio: 1, aspect: 1, fill: 1, invertInDark: true },
  'kvcache-ai.svg': { ratio: 1, aspect: 1, fill: 1, invertInDark: true },
  'lambda.svg': { ratio: 4.588, aspect: 4.62, fill: 0.99, invertInDark: true },
  'lmcache.webp': { ratio: 4.706, aspect: 5.41, fill: 0.84 },
  'meta.svg': { ratio: 4.963, aspect: 4.96, fill: 1, invertInDark: true },
  'microsoft.svg': { ratio: 1, aspect: 1, fill: 1 },
  'minimax-color.svg': { ratio: 1, aspect: 1.19, fill: 0.84 },
  'moonshot-ai.svg': { ratio: 1, aspect: 1, fill: 1, invertInDark: true },
  'morph.svg': { ratio: 3.625, aspect: 4.282, fill: 0.8125 },
  'nebius.svg': { ratio: 3.639, aspect: 3.62, fill: 1 },
  'nvidia-color.svg': { ratio: 1, aspect: 1.51, fill: 0.66 },
  'openai.svg': { ratio: 0.985, aspect: 0.99, fill: 1, invertInDark: true },
  'oracle.svg': { ratio: 7.692, aspect: 7.68, fill: 1 },
  'periodic-labs.png': { ratio: 5.279, aspect: 5.29, fill: 1, invertInDark: true },
  'prime-intellect.svg': { ratio: 6, aspect: 7.65, fill: 0.78, invertInDark: true },
  'pytorch.svg': { ratio: 1, aspect: 0.83, fill: 1, invertInDark: true },
  'qwen-color.svg': { ratio: 1, aspect: 1, fill: 0.94 },
  'redhat.svg': { ratio: 4.228, aspect: 4.25, fill: 0.99, invertInDark: true },
  'sambanova.webp': { ratio: 4.444, aspect: 4.44, fill: 1, invertInDark: true },
  'sglang.webp': { ratio: 3.246, aspect: 3.39, fill: 0.77 },
  'sky-berkeley.webp': { ratio: 4.211, aspect: 4.13, fill: 0.99, invertInDark: true },
  'stanford.svg': { ratio: 4.466, aspect: 4.77, fill: 0.92, invertInDark: true },
  'supermicro.svg': { ratio: 1.88, aspect: 1.95, fill: 0.93, invertInDark: true },
  'tensormesh.svg': { ratio: 5.938, aspect: 5.94, fill: 1, invertInDark: true },
  'tensorwave.svg': { ratio: 10.062, aspect: 10.02, fill: 1, invertInDark: true },
  'tilert.webp': { ratio: 3.083, aspect: 3.08, fill: 1, invertInDark: true },
  'together-ai.svg': { ratio: 4.348, aspect: 5.46, fill: 0.75, invertInDark: true },
  'uc-san-diego.svg': { ratio: 4.318, aspect: 5.36, fill: 0.81, invertInDark: true },
  'verda.svg': { ratio: 4.412, aspect: 4.57, fill: 0.96, invertInDark: true },
  'vllm.svg': { ratio: 1, aspect: 0.96, fill: 0.75 },
  'voltage-park.svg': { ratio: 7.263, aspect: 7.08, fill: 1, invertInDark: true },
  'vultr.svg': { ratio: 1, aspect: 1.15, fill: 0.87, invertInDark: true },
  'weka.svg': { ratio: 4.839, aspect: 4.84, fill: 1, invertInDark: true },
  'zai-color.svg': { ratio: 1, aspect: 1, fill: 1, invertInDark: true },
};

const FALLBACK: LogoMetrics = { ratio: 1, aspect: 1, fill: 1 };

/** Artwork height (px) for a square mark at desktop size. */
export const BASE_ARTWORK_HEIGHT = 44;
/** Wider artwork shrinks as aspect^-SIZE_EXPONENT so wordmarks don't overpower marks. */
const SIZE_EXPONENT = 0.5;

export interface LogoSize {
  /** Rendered image height in px (includes any built-in padding in the file). */
  height: number;
  /** Rendered image width in px at that height. */
  width: number;
  invertInDark: boolean;
}

/** Desktop display size for a logo file; phones scale this down in CSS. */
export function logoSize(file: string, base = BASE_ARTWORK_HEIGHT): LogoSize {
  const m = LOGO_METRICS[file] ?? FALLBACK;
  const artworkHeight = base * Math.max(m.aspect, 1) ** -SIZE_EXPONENT;
  const height = Math.round(artworkHeight / m.fill);
  return {
    height,
    width: Math.round(height * m.ratio),
    invertInDark: m.invertInDark ?? false,
  };
}
