/**
 * V82: Chip Layout — Processor chip aesthetic with a central bordered rectangle
 * containing the title, thin "pins" extending from each side, and PCB-style background.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

// Chip dimensions
const CHIP_LEFT = 160;
const CHIP_TOP = 130;
const CHIP_WIDTH = 880;
const CHIP_HEIGHT = 370;

// Pins extending from each side
const topPins = Array.from({ length: 18 }, (_, i) => ({
  x: CHIP_LEFT + 40 + i * 48,
  y: CHIP_TOP - 40,
  w: 2,
  h: 40,
}));

const bottomPins = Array.from({ length: 18 }, (_, i) => ({
  x: CHIP_LEFT + 40 + i * 48,
  y: CHIP_TOP + CHIP_HEIGHT,
  w: 2,
  h: 40,
}));

const leftPins = Array.from({ length: 8 }, (_, i) => ({
  x: CHIP_LEFT - 40,
  y: CHIP_TOP + 30 + i * 42,
  w: 40,
  h: 2,
}));

const rightPins = Array.from({ length: 8 }, (_, i) => ({
  x: CHIP_LEFT + CHIP_WIDTH,
  y: CHIP_TOP + 30 + i * 42,
  w: 40,
  h: 2,
}));

// PCB traces extending from pins to edges
const traces = [
  { x: 0, y: 165, w: 120, h: 1 },
  { x: 0, y: 250, w: 120, h: 1 },
  { x: 0, y: 375, w: 120, h: 1 },
  { x: 1080, y: 190, w: 120, h: 1 },
  { x: 1080, y: 300, w: 120, h: 1 },
  { x: 1080, y: 420, w: 120, h: 1 },
  { x: 300, y: 0, w: 1, h: 90 },
  { x: 540, y: 0, w: 1, h: 90 },
  { x: 780, y: 0, w: 1, h: 90 },
  { x: 350, y: 540, w: 1, h: 90 },
  { x: 600, y: 540, w: 1, h: 90 },
  { x: 850, y: 540, w: 1, h: 90 },
];

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 44 : meta.title.length > 40 ? 52 : 58;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: '#141a14',
        color: '#e0e8e0',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* PCB traces */}
      {traces.map((t, i) => (
        <div
          key={`tr${i}`}
          style={{
            position: 'absolute',
            left: t.x,
            top: t.y,
            width: t.w,
            height: t.h,
            backgroundColor: '#2a4a2a40',
            display: 'flex',
          }}
        />
      ))}

      {/* Top pins */}
      {topPins.map((p, i) => (
        <div
          key={`tp${i}`}
          style={{
            position: 'absolute',
            left: p.x,
            top: p.y,
            width: p.w,
            height: p.h,
            backgroundColor: '#5a8a5a60',
            display: 'flex',
          }}
        />
      ))}

      {/* Bottom pins */}
      {bottomPins.map((p, i) => (
        <div
          key={`bp${i}`}
          style={{
            position: 'absolute',
            left: p.x,
            top: p.y,
            width: p.w,
            height: p.h,
            backgroundColor: '#5a8a5a60',
            display: 'flex',
          }}
        />
      ))}

      {/* Left pins */}
      {leftPins.map((p, i) => (
        <div
          key={`lp${i}`}
          style={{
            position: 'absolute',
            left: p.x,
            top: p.y,
            width: p.w,
            height: p.h,
            backgroundColor: '#5a8a5a60',
            display: 'flex',
          }}
        />
      ))}

      {/* Right pins */}
      {rightPins.map((p, i) => (
        <div
          key={`rp${i}`}
          style={{
            position: 'absolute',
            left: p.x,
            top: p.y,
            width: p.w,
            height: p.h,
            backgroundColor: '#5a8a5a60',
            display: 'flex',
          }}
        />
      ))}

      {/* Chip body */}
      <div
        style={{
          position: 'absolute',
          left: CHIP_LEFT,
          top: CHIP_TOP,
          width: CHIP_WIDTH,
          height: CHIP_HEIGHT,
          border: '2px solid #4a7a4a',
          backgroundColor: '#1a2a1a',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '30px 40px',
        }}
      >
        {/* Corner notch indicator */}
        <div
          style={{
            position: 'absolute',
            left: 10,
            top: 10,
            width: 16,
            height: 16,
            borderRadius: 9999,
            border: '2px solid #4a7a4a50',
            display: 'flex',
          }}
        />

        {/* Logo + chip label */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 2,
          }}
        >
          <img src={logoSrc} height={26} />
          <span style={{ fontSize: 12, color: '#4a7a4a', letterSpacing: 2 }}>IX-BLOG-PROC</span>
        </div>

        {/* Title */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, zIndex: 2 }}>
          <div
            style={{
              fontSize: titleSize,
              fontWeight: 700,
              lineHeight: 1.2,
              color: '#e8f0e8',
              display: 'flex',
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              fontSize: 22,
              color: '#7aaa7a',
              lineHeight: 1.4,
              maxHeight: 64,
              overflow: 'hidden',
              display: 'flex',
            }}
          >
            {meta.excerpt.length > 120 ? meta.excerpt.slice(0, 120) + '...' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 24, fontSize: 18, color: '#5a8a5a', zIndex: 2 }}>
          <span style={{ fontWeight: 600, color: '#8aba8a' }}>{meta.author}</span>
          <span style={{ color: '#4a7a4a50' }}>|</span>
          <span>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#4a7a4a50' }}>|</span>
          <span>{meta.readingTime} min</span>
        </div>
      </div>
    </div>,
    size,
  );
}
