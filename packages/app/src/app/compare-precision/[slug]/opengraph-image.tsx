/**
 * Precision compare OG image — identical circuit tile sidebar layout to the
 * /compare OG and the blog OG, but the eyebrow and bottom banner surface
 * the "Precision Comparison" framing.
 */
import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';

import { HW_REGISTRY } from '@semianalysisai/inferencex-constants';

import { getAllComparablePrecisionSlugs } from '@/lib/compare-variant-availability';
import {
  canonicalPrecisionCompareSlug,
  parsePrecisionCompareSlug,
  precisionDisplayLabel,
} from '@/lib/compare-variant-slug';
import { BG, BLUE, getLogoSrc, getTiles, PANEL_BG } from '@/lib/og-assets';

export const alt = 'GPU precision inference benchmark comparison';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export async function generateStaticParams() {
  const slugs = await getAllComparablePrecisionSlugs();
  return slugs.map(({ modelSlug, gpu, precA, precB }) => ({
    slug: canonicalPrecisionCompareSlug(modelSlug, gpu, precA, precB),
  }));
}

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const parsed = parsePrecisionCompareSlug(slug);
  if (!parsed) notFound();
  const [logoSrc, tiles] = await Promise.all([getLogoSrc(), getTiles()]);

  const gpuMeta = HW_REGISTRY[parsed.gpu];
  const gpuLabel = gpuMeta?.label ?? parsed.gpu.toUpperCase();
  const aLabel = precisionDisplayLabel(parsed.precA);
  const bLabel = precisionDisplayLabel(parsed.precB);
  const title = `${gpuLabel}: ${aLabel} vs ${bLabel}`;
  const eyebrow = `${parsed.model.label} · Precision Comparison`;
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
            AI inference benchmark · precision comparison
          </span>
          {logoSrc && <img src={logoSrc} height={72} />}
        </div>
      </div>
    </div>,
    size,
  );
}
