/**
 * Blog OG image — circuit tile sidebar with content panel.
 */
import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';
import { loadImageAsDataUri, ogTitleFontSize, ogWrapSubtitle } from '@/lib/og-image-utils';

export const size = { width: 1200, height: 630 };

const BLUE = '#0B86D1';
const BG = '#131416';
const PANEL_BG = '#0F1214';

// Tile grid layout (row-major, 2 cols). rotate: degrees to apply at render time.
const TILE_GRID: ({ file: string; rotate?: number } | null)[] = [
  { file: 'teal-chevron.png', rotate: 180 }, // r0c0
  { file: 'gold-diagonal.png' }, // r0c1
  { file: 'teal-circuit.png' }, // r1c0
  null, // r1c1
  { file: 'gold-wavy.png' }, // r2c0
  { file: 'teal-chip.png' }, // r2c1
  { file: 'teal-chevron.png', rotate: 90 }, // r3c0
  { file: 'teal-organic.png' }, // r3c1
  null, // r4c0
  { file: 'gold-circuit.png' }, // r4c1
  { file: 'teal-circuit.png', rotate: 180 }, // r5c0
  { file: 'teal-organic.png', rotate: 180 }, // r5c1
];

// Dedupe tile file loads — same file used multiple times only loads once.
// loadImageAsDataUri already memoises per-path at module level, so concurrent
// calls for the same file collapse to a single read.
async function loadTiles() {
  const uniqueFiles = [...new Set(TILE_GRID.filter(Boolean).map((t) => t!.file))];
  const loaded = await Promise.all(
    uniqueFiles.map(async (f) => [f, await loadImageAsDataUri(`brand/og-tiles/${f}`)] as const),
  );
  const cache = Object.fromEntries(loaded);
  return TILE_GRID.map((t) => (t ? { src: cache[t.file] as string, rotate: t.rotate } : null));
}

export async function renderOgImage(meta: BlogPostMeta) {
  const [logoSrc, tiles] = await Promise.all([
    loadImageAsDataUri('brand/logo-color.png'),
    loadTiles(),
  ]);
  const titleSize = ogTitleFontSize(meta.title.length);
  const subtitle = ogWrapSubtitle(meta.subtitle, meta.title.length);

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: BG,
        color: '#EAEBEC',
        overflow: 'hidden',
      }}
    >
      {/* Left panel */}
      <div
        style={{
          display: 'flex',
          width: 195,
          height: '100%',
          backgroundColor: PANEL_BG,
          position: 'relative',
        }}
      >
        {/* Grid of circuit tile images */}
        {tiles.map((tile, i) => {
          if (!tile) return null;
          const row = Math.floor(i / 2);
          const col = i % 2;
          return (
            <img
              key={i}
              src={tile.src}
              alt=""
              style={{
                position: 'absolute',
                left: 12 + col * 90,
                top: 12 + row * 104,
                width: 78,
                height: 86,
                borderRadius: 4,
                objectFit: 'cover',
                ...(tile.rotate ? { transform: `rotate(${tile.rotate}deg)` } : {}),
              }}
            />
          );
        })}
        {/* Blue accent bar */}
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            width: 3,
            height: '100%',
            backgroundColor: BLUE,
            display: 'flex',
          }}
        />
      </div>

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 1,
          padding: '48px 55px 20px 55px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            flex: 1,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              fontSize: titleSize,
              fontWeight: 700,
              lineHeight: 1.2,
              color: '#FFFFFF',
              flexShrink: 0,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              fontSize: 42,
              color: '#C9CACB',
              lineHeight: 1.4,
              overflow: 'hidden',
            }}
          >
            {subtitle}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 28, color: '#d4d4d8' }}>
            {new Date(`${meta.date}T00:00:00Z`).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          {logoSrc && <img src={logoSrc} height={80} alt="SemiAnalysis" />}
        </div>
      </div>
    </div>,
    size,
  );
}
