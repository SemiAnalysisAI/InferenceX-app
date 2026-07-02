/**
 * Compare OG image — same circuit tile sidebar layout as the blog OG.
 */
import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';

import { getAllComparableCompareSlugs } from '@/lib/compare-availability';
import { canonicalCompareSlug, compareDisplayLabel, parseCompareSlug } from '@/lib/compare-slug';
import { loadImageAsDataUri, TILE_GRID } from '@/lib/og-image-utils';

export const alt = 'GPU inference benchmark comparison';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BLUE = '#0B86D1';
const BG = '#131416';
const PANEL_BG = '#0F1214';

export async function generateStaticParams() {
  // Mirror the SSR page's static params — only emit (model, pair) combos
  // with benchmark data on both sides so we don't generate OG images for
  // empty pages.
  const slugs = await getAllComparableCompareSlugs();
  return slugs.map(({ modelSlug, a, b }) => ({ slug: canonicalCompareSlug(modelSlug, a, b) }));
}

async function getTiles(): Promise<({ src: string; rotate?: number } | null)[]> {
  const uniqueFiles = [...new Set(TILE_GRID.filter(Boolean).map((t) => t!.file))];
  const loaded = await Promise.all(
    uniqueFiles.map(async (f) => [f, await loadImageAsDataUri(`brand/og-tiles/${f}`)] as const),
  );
  const cache = Object.fromEntries(loaded);
  return TILE_GRID.map((t) => (t ? { src: cache[t.file] as string, rotate: t.rotate } : null));
}

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = parseCompareSlug(slug);
  if (!parsed) notFound();
  const [logoSrc, tiles] = await Promise.all([
    loadImageAsDataUri('brand/logo-color.png'),
    getTiles(),
  ]);

  const title = compareDisplayLabel(parsed.a, parsed.b);
  const eyebrow = `${parsed.model.label} · Head-to-head GPU benchmark`;
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
              fontSize: 24,
              color: '#9BA0A6',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              display: 'flex',
            }}
          >
            {eyebrow}
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
