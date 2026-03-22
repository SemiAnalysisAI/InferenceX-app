/**
 * V88: Diamond Lattice — pattern of diamond shapes (border-only rotated squares) forming a lattice across the background. Silver/grey on dark.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

interface Diamond {
  x: number;
  y: number;
  size: number;
  opacity: number;
  filled: boolean;
}

const DIAMONDS: Diamond[] = [];

// Generate a lattice grid of diamonds
const COLS = 12;
const ROWS = 7;
const SPACING_X = 105;
const SPACING_Y = 95;
const OFFSET_X = 30;
const OFFSET_Y = 10;

for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const x = OFFSET_X + col * SPACING_X + (row % 2 === 1 ? SPACING_X / 2 : 0);
    const y = OFFSET_Y + row * SPACING_Y;
    // Skip diamonds in the center content area
    if (y > 140 && y < 430 && x > 80 && x < 960) continue;
    const diamondSize = 28 + ((col + row) % 3) * 6;
    const opacity = 0.06 + ((col * row) % 5) * 0.02;
    const filled = (col + row) % 7 === 0;
    DIAMONDS.push({ x, y, size: diamondSize, opacity, filled });
  }
}

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
        backgroundColor: '#111118',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Diamond lattice elements — rotated squares */}
      {DIAMONDS.map((d, i) => (
        <div
          key={`d-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: d.x - d.size / 2,
            top: d.y - d.size / 2,
            width: d.size,
            height: d.size,
            border: d.filled ? 'none' : '1.5px solid #94a3b8',
            backgroundColor: d.filled ? '#94a3b8' : 'transparent',
            opacity: d.opacity,
            transform: 'rotate(45deg)',
          }}
        />
      ))}

      {/* Subtle connecting lines — horizontal */}
      {[95, 190, 475, 570].map((y, i) => (
        <div
          key={`hl-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: 0,
            top: y,
            width: 1200,
            height: 1,
            backgroundColor: '#475569',
            opacity: 0.06,
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
          <span style={{ color: '#cbd5e1', fontSize: 22, marginLeft: 12, fontWeight: 600 }}>
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
              color: '#f1f5f9',
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
              opacity: 0.85,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ color: '#cbd5e1', fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#334155', fontSize: 22 }}>{'\u00b7'}</span>
          <span style={{ color: '#64748b', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#334155', fontSize: 22 }}>{'\u00b7'}</span>
          <span style={{ color: '#64748b', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
