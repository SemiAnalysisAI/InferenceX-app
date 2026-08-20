import { ImageResponse } from 'next/og';

import {
  BG,
  BLUE,
  getCjkFonts,
  getLogoSrc,
  getTiles,
  MUTED,
  PANEL_BG,
  TEXT,
  TITLE,
} from '@/lib/og-assets';

interface CompareOgSize {
  width: number;
  height: number;
}

interface CompareOgOptions {
  eyebrow: string;
  title: string;
  titleSize: number;
  footer: string;
  language: 'en' | 'zh';
  size: CompareOgSize;
}

/** Shared compare OG layout with optional bundled Simplified Chinese fonts. */
export async function renderCompareOg({
  eyebrow,
  title,
  titleSize,
  footer,
  language,
  size,
}: CompareOgOptions): Promise<ImageResponse> {
  const [logoSrc, tiles, fonts] = await Promise.all([
    getLogoSrc(),
    getTiles(),
    language === 'zh' ? getCjkFonts() : Promise.resolve([]),
  ]);

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: BG,
        color: TEXT,
        overflow: 'hidden',
        ...(language === 'zh' ? { fontFamily: 'Noto Sans SC' } : {}),
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
        {tiles.map((tile, index) => {
          if (!tile) return null;
          const row = Math.floor(index / 2);
          const column = index % 2;
          return (
            <img
              key={index}
              src={tile.src}
              style={{
                position: 'absolute',
                left: 12 + column * 90,
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
              color: MUTED,
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
              color: TITLE,
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
          <span style={{ fontSize: 26, color: MUTED, display: 'flex' }}>{footer}</span>
          {logoSrc && <img src={logoSrc} height={72} />}
        </div>
      </div>
    </div>,
    {
      ...size,
      ...(fonts.length > 0 ? { fonts } : {}),
    },
  );
}
