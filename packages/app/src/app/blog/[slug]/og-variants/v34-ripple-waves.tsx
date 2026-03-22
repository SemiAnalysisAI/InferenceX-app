/**
 * V34: Ripple Waves — concentric quarter-circles emanating from the bottom-left corner.
 * Thin borders with decreasing opacity creating a radar/sonar feel.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const RIPPLES = [
  { radius: 100, opacity: 0.55, width: 2 },
  { radius: 190, opacity: 0.45, width: 2 },
  { radius: 290, opacity: 0.38, width: 1.5 },
  { radius: 400, opacity: 0.3, width: 1.5 },
  { radius: 520, opacity: 0.22, width: 1 },
  { radius: 650, opacity: 0.16, width: 1 },
  { radius: 790, opacity: 0.1, width: 1 },
  { radius: 940, opacity: 0.06, width: 1 },
  { radius: 1100, opacity: 0.03, width: 1 },
];

const ORIGIN_X = 0;
const ORIGIN_Y = 630;

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0a1628',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ripple quarter-circles from bottom-left */}
      {RIPPLES.map((ripple, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            left: ORIGIN_X - ripple.radius,
            top: ORIGIN_Y - ripple.radius,
            width: ripple.radius * 2,
            height: ripple.radius * 2,
            borderRadius: 9999,
            border: `${ripple.width}px solid #10b981`,
            opacity: ripple.opacity,
          }}
        />
      ))}

      {/* Origin glow */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: -30,
          bottom: -30,
          width: 60,
          height: 60,
          borderRadius: 9999,
          backgroundColor: '#10b981',
          opacity: 0.3,
        }}
      />

      {/* Pulse dot at origin */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: -8,
          bottom: -8,
          width: 16,
          height: 16,
          borderRadius: 9999,
          backgroundColor: '#34d399',
          opacity: 0.8,
        }}
      />

      {/* Scan line accent — a thicker arc */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: ORIGIN_X - 350,
          top: ORIGIN_Y - 350,
          width: 700,
          height: 700,
          borderRadius: 9999,
          border: '3px solid #6ee7b7',
          opacity: 0.12,
        }}
      />

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '48px 56px',
          width: '100%',
          height: '100%',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} width={44} height={44} />
          <span style={{ color: '#a7f3d0', fontSize: 22, marginLeft: 12, fontWeight: 600 }}>
            InferenceX
          </span>
        </div>

        {/* Title & excerpt — positioned toward upper right to avoid ripple overlap */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            maxWidth: 800,
            alignSelf: 'flex-end',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 800,
              color: '#ecfdf5',
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#6ee7b7',
              lineHeight: 1.5,
              opacity: 0.7,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, alignSelf: 'flex-end' }}>
          <span style={{ color: '#34d399', fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#1a3a2a', fontSize: 22 }}>\u00b7</span>
          <span style={{ color: '#6b7280', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#1a3a2a', fontSize: 22 }}>\u00b7</span>
          <span style={{ color: '#6b7280', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
