/**
 * V26: Halftone Dots — dots decrease in size from one corner to the other.
 * Dark background with teal and gold dots scattered in a gradient halftone pattern.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

function generateHalftoneDots() {
  const dots: { x: number; y: number; size: number; color: string; opacity: number }[] = [];
  const cols = 18;
  const rows = 10;
  const spacingX = 1200 / cols;
  const spacingY = 630 / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const distFromTopLeft = Math.sqrt(c * c + r * r) / Math.sqrt(cols * cols + rows * rows);
      const dotSize = Math.max(3, 28 * (1 - distFromTopLeft));
      const isTeal = (r + c) % 3 !== 0;
      dots.push({
        x: c * spacingX + spacingX / 2,
        y: r * spacingY + spacingY / 2,
        size: dotSize,
        color: isTeal ? '#2dd4bf' : '#f59e0b',
        opacity: 0.15 + 0.55 * (1 - distFromTopLeft),
      });
    }
  }
  return dots;
}

const DOTS = generateHalftoneDots();

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
        backgroundColor: '#0f172a',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Halftone dots */}
      {DOTS.map((dot, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            left: dot.x - dot.size / 2,
            top: dot.y - dot.size / 2,
            width: dot.size,
            height: dot.size,
            borderRadius: 9999,
            backgroundColor: dot.color,
            opacity: dot.opacity,
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
          <img src={logoSrc} width={48} height={48} />
          <span style={{ color: '#e2e8f0', fontSize: 24, marginLeft: 14, fontWeight: 600 }}>
            InferenceX
          </span>
        </div>

        {/* Title & excerpt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 800,
              color: '#f8fafc',
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#94a3b8',
              lineHeight: 1.5,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{ color: '#2dd4bf', fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#475569', fontSize: 18 }}>/</span>
          <span style={{ color: '#64748b', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#475569', fontSize: 18 }}>/</span>
          <span style={{ color: '#64748b', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
