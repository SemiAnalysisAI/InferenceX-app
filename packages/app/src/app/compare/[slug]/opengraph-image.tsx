/**
 * Compare OG image — same circuit tile sidebar layout as the blog OG.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';

import {
  allCanonicalComparePairs,
  canonicalCompareSlug,
  compareDisplayLabel,
  parseCompareSlug,
} from '@/lib/compare-slug';

export const alt = 'GPU inference benchmark comparison';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BLUE = '#0B86D1';
const BG = '#131416';
const PANEL_BG = '#0F1214';

// Same tile grid as the blog OG so the two OG types read as a family.
const TILE_GRID: ({ file: string; rotate?: number } | null)[] = [
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

export function generateStaticParams() {
  return allCanonicalComparePairs().map(({ a, b }) => ({ slug: canonicalCompareSlug(a, b) }));
}

// Read once at module load; a missing asset must not 500 every OG route.
let logoSrcPromise: Promise<string | null> | undefined;
function getLogoSrc(): Promise<string | null> {
  if (!logoSrcPromise) {
    logoSrcPromise = readFile(join(process.cwd(), 'public/brand/logo-color.png'))
      .then((buf) => `data:image/png;base64,${buf.toString('base64')}`)
      .catch(() => null);
  }
  return logoSrcPromise;
}

let tilesPromise: Promise<({ src: string; rotate?: number } | null)[]> | undefined;
function getTiles(): Promise<({ src: string; rotate?: number } | null)[]> {
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

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pair = parseCompareSlug(slug);
  if (!pair) notFound();
  const [logoSrc, tiles] = await Promise.all([getLogoSrc(), getTiles()]);

  const title = compareDisplayLabel(pair.a, pair.b);
  // Content area is ~895px wide (1200 - 195 panel - 55*2 padding). Scale the
  // title size down for longer labels so it fits without truncating.
  const titleSize = title.length > 26 ? 80 : title.length > 18 ? 96 : 112;

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
      {/* Left tile panel — identical pattern to blog OG */}
      <div
        style={{
          display: 'flex',
          width: 195,
          height: '100%',
          backgroundColor: PANEL_BG,
          position: 'relative',
        }}
      >
        {tiles.map((tile, i) => {
          if (!tile) return null;
          const row = Math.floor(i / 2);
          const col = i % 2;
          return (
            <img
              key={i}
              src={tile.src}
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
            gap: 24,
            flex: 1,
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontSize: 26,
              color: '#9BA0A6',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              display: 'flex',
            }}
          >
            Head-to-head GPU benchmark
          </div>

          <div
            style={{
              fontSize: titleSize,
              fontWeight: 800,
              color: '#FFFFFF',
              lineHeight: 1.1,
              display: 'flex',
            }}
          >
            {title}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 26, color: '#9BA0A6', display: 'flex' }}>
            AI inference benchmark · latency, throughput, cost
          </span>
          {logoSrc && <img src={logoSrc} height={72} />}
        </div>
      </div>
    </div>,
    size,
  );
}
