// Shared OG tile grid, logo, font loaders, and color tokens.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const BLUE = '#0B86D1';
export const BG = '#131416';
export const PANEL_BG = '#0F1214';
export const TEXT = '#EAEBEC';
export const MUTED = '#9BA0A6';
export const TITLE = '#FFFFFF';

export const TILE_GRID: ({ file: string; rotate?: number } | null)[] = [
  { file: 'teal-chevron.png', rotate: 180 },
  { file: 'gold-diagonal.png' },
  { file: 'teal-circuit.png' },
  null,
  { file: 'gold-wavy.png' },
  { file: 'teal-chip.png' },
  { file: 'teal-chevron.png', rotate: 90 },
  { file: 'teal-organic.png' },
  null,
  { file: 'gold-circuit.png' },
  { file: 'teal-circuit.png', rotate: 180 },
  { file: 'teal-organic.png', rotate: 180 },
];

let logoSrcPromise: Promise<string | null> | undefined;
export function getLogoSrc(): Promise<string | null> {
  if (!logoSrcPromise) {
    logoSrcPromise = readFile(join(process.cwd(), 'public/brand/logo-color.png'))
      .then((buf) => `data:image/png;base64,${buf.toString('base64')}`)
      .catch(() => null);
  }
  return logoSrcPromise;
}

let tilesPromise: Promise<({ src: string; rotate?: number } | null)[]> | undefined;
export function getTiles(): Promise<({ src: string; rotate?: number } | null)[]> {
  if (!tilesPromise) {
    const uniqueFiles = [...new Set(TILE_GRID.filter(Boolean).map((t) => t!.file))];
    tilesPromise = Promise.all(
      uniqueFiles.map(async (f) => {
        const src = await readFile(join(process.cwd(), 'public/brand/og-tiles', f))
          .then((buf) => `data:image/png;base64,${buf.toString('base64')}`)
          .catch(() => null);
        return [f, src] as const;
      }),
    ).then((loaded) => {
      const cache = Object.fromEntries(loaded);
      return TILE_GRID.map((t) => {
        if (!t) return null;
        const src = cache[t.file];
        return src ? { src, rotate: t.rotate } : null;
      });
    });
  }
  return tilesPromise;
}

export interface OgFontAsset {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 800;
  style: 'normal';
}

let cjkFontsPromise: Promise<OgFontAsset[]> | undefined;
export function getCjkFonts(): Promise<OgFontAsset[]> {
  if (!cjkFontsPromise) {
    // These are Noto Sans CJK SC subsets pinned to upstream tag Sans2.004.
    // Keep compare-image-glyphs.txt synchronized when adding CJK image copy;
    // the font license is preserved beside the subset assets in OFL.txt.
    cjkFontsPromise = Promise.all([
      readFile(new URL('compare-og-fonts/NotoSansCJKsc-Compare-Regular.otf', import.meta.url)),
      readFile(new URL('compare-og-fonts/NotoSansCJKsc-Compare-Bold.otf', import.meta.url)),
    ]).then(([regular, bold]) => [
      {
        name: 'Noto Sans SC',
        data: regular.buffer.slice(
          regular.byteOffset,
          regular.byteOffset + regular.byteLength,
        ) as ArrayBuffer,
        weight: 400,
        style: 'normal',
      },
      {
        name: 'Noto Sans SC',
        data: bold.buffer.slice(bold.byteOffset, bold.byteOffset + bold.byteLength) as ArrayBuffer,
        weight: 800,
        style: 'normal',
      },
    ]);
  }
  return cjkFontsPromise;
}
