/**
 * V27: Dot Grid — uniform dot grid background like graph paper but with dots.
 * Subtle evenly spaced small dots on a warm dark background.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

function generateGridDots() {
  const dots: { x: number; y: number }[] = [];
  const spacing = 32;
  for (let y = spacing; y < 630; y += spacing) {
    for (let x = spacing; x < 1200; x += spacing) {
      dots.push({ x, y });
    }
  }
  return dots;
}

const GRID_DOTS = generateGridDots();

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
        backgroundColor: '#1a1a2e',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Grid dots */}
      {GRID_DOTS.map((dot, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            left: dot.x - 2,
            top: dot.y - 2,
            width: 4,
            height: 4,
            borderRadius: 9999,
            backgroundColor: '#6366f1',
            opacity: 0.2,
          }}
        />
      ))}

      {/* Highlight region — slightly brighter dots near center */}
      {GRID_DOTS.filter((dot) => {
        const dx = dot.x - 600;
        const dy = dot.y - 315;
        return Math.sqrt(dx * dx + dy * dy) < 250;
      }).map((dot, i) => (
        <div
          key={`h-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: dot.x - 2,
            top: dot.y - 2,
            width: 4,
            height: 4,
            borderRadius: 9999,
            backgroundColor: '#818cf8',
            opacity: 0.25,
          }}
        />
      ))}

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
          <span style={{ color: '#c7d2fe', fontSize: 22, marginLeft: 12, fontWeight: 600 }}>
            InferenceX
          </span>
        </div>

        {/* Title & excerpt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 880 }}>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 800,
              color: '#e0e7ff',
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#a5b4fc',
              lineHeight: 1.5,
              opacity: 0.8,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ color: '#818cf8', fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#4338ca', fontSize: 22 }}>\u00b7</span>
          <span style={{ color: '#7c7cad', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#4338ca', fontSize: 22 }}>\u00b7</span>
          <span style={{ color: '#7c7cad', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
