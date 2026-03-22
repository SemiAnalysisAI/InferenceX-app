/**
 * V31: Concentric Rings — large circles centered on the right side, partially off-screen.
 * Creates depth with 7 rings of decreasing opacity using border-only circles.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const RINGS = [
  { radius: 120, border: 2, opacity: 0.5, color: '#06b6d4' },
  { radius: 200, border: 2, opacity: 0.42, color: '#22d3ee' },
  { radius: 290, border: 1.5, opacity: 0.34, color: '#67e8f9' },
  { radius: 390, border: 1.5, opacity: 0.26, color: '#06b6d4' },
  { radius: 500, border: 1, opacity: 0.18, color: '#22d3ee' },
  { radius: 620, border: 1, opacity: 0.12, color: '#67e8f9' },
  { radius: 760, border: 1, opacity: 0.07, color: '#06b6d4' },
];

const CENTER_X = 1050;
const CENTER_Y = 315;

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
        backgroundColor: '#0c1222',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Concentric rings */}
      {RINGS.map((ring, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            left: CENTER_X - ring.radius,
            top: CENTER_Y - ring.radius,
            width: ring.radius * 2,
            height: ring.radius * 2,
            borderRadius: 9999,
            border: `${ring.border}px solid ${ring.color}`,
            opacity: ring.opacity,
          }}
        />
      ))}

      {/* Center glow */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: CENTER_X - 40,
          top: CENTER_Y - 40,
          width: 80,
          height: 80,
          borderRadius: 9999,
          backgroundColor: '#06b6d4',
          opacity: 0.15,
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
          <span style={{ color: '#a5f3fc', fontSize: 22, marginLeft: 12, fontWeight: 600 }}>
            InferenceX
          </span>
        </div>

        {/* Title & excerpt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 750 }}>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 800,
              color: '#ecfeff',
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#67e8f9',
              lineHeight: 1.5,
              opacity: 0.7,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ color: '#22d3ee', fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#164e63', fontSize: 22 }}>\u00b7</span>
          <span style={{ color: '#6b7280', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#164e63', fontSize: 22 }}>\u00b7</span>
          <span style={{ color: '#6b7280', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
