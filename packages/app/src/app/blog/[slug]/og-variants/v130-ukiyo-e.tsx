/**
 * V130: Ukiyo-e — Japanese woodblock print with deep indigo background, stylized wave patterns, cartouche box, and cream text.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;
  const formattedDate = new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const excerpt = meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt;

  // Wave layers from bottom — each wave is a curved div
  const waves = [
    { bottom: 0, height: 80, color: '#1a2a4a', opacity: 1, borderRadius: '50% 50% 0 0' },
    { bottom: 20, height: 70, color: '#1a3050', opacity: 0.9, borderRadius: '60% 40% 0 0' },
    { bottom: 40, height: 65, color: '#1a3560', opacity: 0.8, borderRadius: '40% 60% 0 0' },
    { bottom: 55, height: 60, color: '#1a3a6a', opacity: 0.7, borderRadius: '55% 45% 0 0' },
    { bottom: 70, height: 55, color: '#1a4070', opacity: 0.6, borderRadius: '45% 55% 0 0' },
    { bottom: 82, height: 50, color: '#1a4578', opacity: 0.5, borderRadius: '50% 50% 0 0' },
  ];

  // Wave foam/crest details — small white curved elements on wave tops
  const foamDots = [
    { bottom: 115, left: 150, w: 30, h: 10, opacity: 0.15 },
    { bottom: 120, left: 400, w: 25, h: 8, opacity: 0.12 },
    { bottom: 110, left: 650, w: 35, h: 12, opacity: 0.18 },
    { bottom: 118, left: 900, w: 28, h: 9, opacity: 0.14 },
    { bottom: 95, left: 250, w: 20, h: 7, opacity: 0.1 },
    { bottom: 100, left: 750, w: 22, h: 8, opacity: 0.13 },
    { bottom: 90, left: 1050, w: 18, h: 6, opacity: 0.11 },
  ];

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#1a1a3a',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle background texture — scattered dots */}
      {Array.from({ length: 15 }, (_, i) => (
        <div
          key={`tex-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: (i * 97 + 20) % 500,
            left: (i * 179 + 40) % 1150,
            width: 2,
            height: 2,
            borderRadius: 1,
            backgroundColor: '#f5e6c8',
            opacity: 0.05,
          }}
        />
      ))}

      {/* Wave layers */}
      {waves.map((wave, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: wave.bottom,
            left: -20,
            right: -20,
            height: wave.height,
            backgroundColor: wave.color,
            opacity: wave.opacity,
            borderRadius: wave.borderRadius,
          }}
        />
      ))}

      {/* Foam/crest details */}
      {foamDots.map((foam, i) => (
        <div
          key={`foam-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: foam.bottom,
            left: foam.left,
            width: foam.w,
            height: foam.h,
            borderRadius: foam.w,
            backgroundColor: '#f5e6c8',
            opacity: foam.opacity,
          }}
        />
      ))}

      {/* Cartouche box — top right */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          top: 30,
          right: 40,
          backgroundColor: '#b91c1c',
          border: '3px solid #8b1515',
          borderRadius: 4,
          padding: '12px 14px',
          zIndex: 5,
          alignItems: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              display: 'flex',
              fontSize: 14,
              color: '#f5e6c8',
              fontWeight: 700,
              letterSpacing: '0.15em',
            }}
          >
            INFERENCE
          </span>
          <span
            style={{
              display: 'flex',
              fontSize: 14,
              color: '#f5e6c8',
              fontWeight: 700,
              letterSpacing: '0.15em',
            }}
          >
            X
          </span>
        </div>
      </div>

      {/* Thin vertical red accent line near cartouche */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 25,
          right: 130,
          width: 3,
          height: 90,
          backgroundColor: '#b91c1c',
          opacity: 0.4,
        }}
      />

      {/* Logo — top left */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          position: 'absolute',
          top: 40,
          left: 60,
          zIndex: 4,
        }}
      >
        <img src={logoSrc} width={32} height={32} />
      </div>

      {/* Content area — vertical feeling layout */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          padding: '100px 80px 160px 80px',
          height: '100%',
          zIndex: 3,
        }}
      >
        {/* Thin horizontal divider */}
        <div
          style={{
            display: 'flex',
            width: 200,
            height: 1,
            backgroundColor: '#f5e6c8',
            opacity: 0.2,
            marginBottom: 30,
          }}
        />

        {/* Title */}
        <div
          style={{
            display: 'flex',
            fontSize: titleSize,
            fontWeight: 700,
            color: '#f5e6c8',
            lineHeight: 1.25,
            marginBottom: 24,
            maxWidth: 800,
          }}
        >
          {meta.title}
        </div>

        {/* Excerpt */}
        <div
          style={{
            display: 'flex',
            fontSize: 19,
            color: '#c8b898',
            lineHeight: 1.5,
            marginBottom: 20,
            maxWidth: 700,
          }}
        >
          {excerpt}
        </div>

        {/* Spacer */}
        <div style={{ display: 'flex', flex: 1 }} />

        {/* Footer — above waves */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 15,
              color: '#a09078',
            }}
          >
            {meta.author} &middot; {formattedDate}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 14,
              color: '#a09078',
            }}
          >
            {meta.readingTime} min read
          </div>
        </div>

        {/* Tags */}
        {meta.tags && (
          <div style={{ display: 'flex', marginTop: 10, gap: 12 }}>
            {meta.tags.slice(0, 3).map((tag) => (
              <div
                key={tag}
                style={{
                  display: 'flex',
                  fontSize: 12,
                  color: '#f5e6c8',
                  opacity: 0.5,
                  border: '1px solid #f5e6c833',
                  borderRadius: 3,
                  padding: '2px 8px',
                }}
              >
                {tag}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Decorative horizontal bar above waves */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 140,
          left: 60,
          right: 60,
          height: 1,
          backgroundColor: '#f5e6c8',
          opacity: 0.1,
        }}
      />
    </div>,
    size,
  );
}
