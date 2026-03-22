/**
 * V30: Dot Border — dots arranged along all four edges creating a dotted frame.
 * Gold dots with varied sizes on a dark background.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

interface BorderDot {
  x: number;
  y: number;
  size: number;
  opacity: number;
}

function generateBorderDots() {
  const dots: BorderDot[] = [];
  const margin = 24;
  const spacing = 28;
  const sizes = [5, 6, 7, 8, 6, 5, 7, 8, 6, 7];

  // Top edge
  for (let x = margin; x < 1200 - margin; x += spacing) {
    const idx = Math.floor(x / spacing) % sizes.length;
    dots.push({ x, y: margin, size: sizes[idx], opacity: 0.5 + (idx % 3) * 0.15 });
  }
  // Bottom edge
  for (let x = margin; x < 1200 - margin; x += spacing) {
    const idx = Math.floor(x / spacing) % sizes.length;
    dots.push({
      x,
      y: 630 - margin,
      size: sizes[(idx + 3) % sizes.length],
      opacity: 0.5 + (idx % 3) * 0.15,
    });
  }
  // Left edge (skip corners)
  for (let y = margin + spacing; y < 630 - margin; y += spacing) {
    const idx = Math.floor(y / spacing) % sizes.length;
    dots.push({
      x: margin,
      y,
      size: sizes[(idx + 1) % sizes.length],
      opacity: 0.5 + (idx % 3) * 0.15,
    });
  }
  // Right edge (skip corners)
  for (let y = margin + spacing; y < 630 - margin; y += spacing) {
    const idx = Math.floor(y / spacing) % sizes.length;
    dots.push({
      x: 1200 - margin,
      y,
      size: sizes[(idx + 5) % sizes.length],
      opacity: 0.5 + (idx % 3) * 0.15,
    });
  }

  // Inner border (second ring, slightly smaller dots)
  const innerMargin = 50;
  const innerSpacing = 36;
  // Top inner
  for (let x = innerMargin; x < 1200 - innerMargin; x += innerSpacing) {
    dots.push({ x, y: innerMargin, size: 4, opacity: 0.3 });
  }
  // Bottom inner
  for (let x = innerMargin; x < 1200 - innerMargin; x += innerSpacing) {
    dots.push({ x, y: 630 - innerMargin, size: 4, opacity: 0.3 });
  }
  // Left inner
  for (let y = innerMargin + innerSpacing; y < 630 - innerMargin; y += innerSpacing) {
    dots.push({ x: innerMargin, y, size: 4, opacity: 0.3 });
  }
  // Right inner
  for (let y = innerMargin + innerSpacing; y < 630 - innerMargin; y += innerSpacing) {
    dots.push({ x: 1200 - innerMargin, y, size: 4, opacity: 0.3 });
  }

  return dots;
}

const BORDER_DOTS = generateBorderDots();

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
        backgroundColor: '#1c1917',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Border dots */}
      {BORDER_DOTS.map((dot, i) => (
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
            backgroundColor: '#f59e0b',
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
          padding: '72px 80px',
          width: '100%',
          height: '100%',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} width={44} height={44} />
          <span style={{ color: '#fef3c7', fontSize: 22, marginLeft: 12, fontWeight: 600 }}>
            InferenceX
          </span>
        </div>

        {/* Title & excerpt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 850 }}>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 800,
              color: '#fefce8',
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 21,
              color: '#d6d3d1',
              lineHeight: 1.5,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ color: '#fbbf24', fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#57534e', fontSize: 22 }}>\u2014</span>
          <span style={{ color: '#a8a29e', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#57534e', fontSize: 22 }}>\u2014</span>
          <span style={{ color: '#a8a29e', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
