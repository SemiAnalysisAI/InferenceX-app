/**
 * V147: Star Chart — Very dark navy bg with scattered stars of varying sizes,
 * constellation lines, a large planet/moon, and coordinate grid. Astronomy aesthetic.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#050510';
const STAR_DIM = '#ffffff30';
const STAR_MID = '#ffffff60';
const STAR_BRIGHT = '#ffffffcc';
const GRID_LINE = '#ffffff08';
const CONSTELLATION_LINE = '#4488ff25';

// Stars scattered across the sky
const stars: { x: number; y: number; size: number; brightness: string }[] = [
  { x: 80, y: 50, size: 2, brightness: STAR_DIM },
  { x: 200, y: 90, size: 3, brightness: STAR_MID },
  { x: 340, y: 30, size: 1, brightness: STAR_DIM },
  { x: 450, y: 120, size: 4, brightness: STAR_BRIGHT },
  { x: 560, y: 60, size: 2, brightness: STAR_MID },
  { x: 700, y: 40, size: 1, brightness: STAR_DIM },
  { x: 820, y: 100, size: 3, brightness: STAR_BRIGHT },
  { x: 950, y: 55, size: 2, brightness: STAR_MID },
  { x: 1050, y: 130, size: 1, brightness: STAR_DIM },
  { x: 130, y: 200, size: 2, brightness: STAR_MID },
  { x: 280, y: 250, size: 3, brightness: STAR_BRIGHT },
  { x: 420, y: 210, size: 1, brightness: STAR_DIM },
  { x: 600, y: 180, size: 2, brightness: STAR_MID },
  { x: 750, y: 230, size: 4, brightness: STAR_BRIGHT },
  { x: 880, y: 200, size: 1, brightness: STAR_DIM },
  { x: 1100, y: 220, size: 2, brightness: STAR_MID },
  { x: 150, y: 350, size: 1, brightness: STAR_DIM },
  { x: 300, y: 400, size: 2, brightness: STAR_MID },
  { x: 500, y: 370, size: 1, brightness: STAR_DIM },
  { x: 680, y: 420, size: 3, brightness: STAR_MID },
  { x: 850, y: 360, size: 1, brightness: STAR_DIM },
  { x: 1000, y: 390, size: 2, brightness: STAR_MID },
  { x: 90, y: 500, size: 2, brightness: STAR_DIM },
  { x: 400, y: 530, size: 1, brightness: STAR_DIM },
  { x: 620, y: 560, size: 2, brightness: STAR_MID },
  { x: 780, y: 510, size: 1, brightness: STAR_DIM },
  { x: 1080, y: 480, size: 3, brightness: STAR_MID },
];

// Constellation — connected star positions
const constellation = [
  { x: 450, y: 120 },
  { x: 600, y: 180 },
  { x: 750, y: 230 },
  { x: 820, y: 100 },
  { x: 950, y: 55 },
];

// Grid lines for coordinate system
const gridLinesH = [0, 105, 210, 315, 420, 525, 630];
const gridLinesV = [0, 150, 300, 450, 600, 750, 900, 1050, 1200];

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        backgroundColor: BG,
        color: '#c8d0e8',
        padding: 60,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Grid lines — horizontal */}
      {gridLinesH.map((y, i) => (
        <div
          key={`gh${i}`}
          style={{
            position: 'absolute',
            left: 0,
            top: y,
            width: 1200,
            height: 1,
            backgroundColor: GRID_LINE,
            display: 'flex',
          }}
        />
      ))}

      {/* Grid lines — vertical */}
      {gridLinesV.map((x, i) => (
        <div
          key={`gv${i}`}
          style={{
            position: 'absolute',
            left: x,
            top: 0,
            width: 1,
            height: 630,
            backgroundColor: GRID_LINE,
            display: 'flex',
          }}
        />
      ))}

      {/* Planet/Moon in top-right corner */}
      <div
        style={{
          position: 'absolute',
          right: -40,
          top: -40,
          width: 180,
          height: 180,
          borderRadius: 90,
          border: '1px solid #ffffff15',
          backgroundColor: '#0a0a20',
          display: 'flex',
        }}
      />
      {/* Planet inner highlight */}
      <div
        style={{
          position: 'absolute',
          right: -10,
          top: -10,
          width: 120,
          height: 120,
          borderRadius: 60,
          backgroundColor: '#ffffff04',
          display: 'flex',
        }}
      />

      {/* Stars */}
      {stars.map((s, i) => (
        <div
          key={`s${i}`}
          style={{
            position: 'absolute',
            left: s.x - s.size / 2,
            top: s.y - s.size / 2,
            width: s.size,
            height: s.size,
            borderRadius: s.size / 2,
            backgroundColor: s.brightness,
            display: 'flex',
          }}
        />
      ))}

      {/* Constellation lines */}
      {constellation.slice(0, -1).map((star, i) => {
        const next = constellation[i + 1];
        const minX = Math.min(star.x, next.x);
        const minY = Math.min(star.y, next.y);
        const w = Math.abs(next.x - star.x) || 1;
        const _h = Math.abs(next.y - star.y) || 1;
        // Approximate line with a thin div (diagonal won't be perfect but suggests a connection)
        return (
          <div
            key={`cl${i}`}
            style={{
              position: 'absolute',
              left: minX,
              top: minY,
              width: w,
              height: 1,
              backgroundColor: CONSTELLATION_LINE,
              display: 'flex',
            }}
          />
        );
      })}

      {/* Coordinate labels */}
      <div
        style={{
          position: 'absolute',
          left: 12,
          top: 8,
          fontSize: 11,
          color: '#ffffff20',
          display: 'flex',
        }}
      >
        RA 00h 00m
      </div>
      <div
        style={{
          position: 'absolute',
          right: 12,
          bottom: 8,
          fontSize: 11,
          color: '#ffffff20',
          display: 'flex',
        }}
      >
        DEC +90° 00&apos;
      </div>

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', zIndex: 1 }}>
        <img src={logoSrc} height={32} />
      </div>

      {/* Title + excerpt */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, zIndex: 1 }}>
        <div
          style={{
            fontSize: 14,
            color: '#4488ff',
            letterSpacing: 4,
            textTransform: 'uppercase',
          }}
        >
          CATALOG ENTRY
        </div>
        <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.2, color: '#eef2ff' }}>
          {meta.title}
        </div>
        <div
          style={{
            fontSize: 26,
            color: '#6070a0',
            lineHeight: 1.4,
            maxHeight: 80,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', gap: 24, fontSize: 22, color: '#506090', zIndex: 1 }}>
        <span style={{ fontWeight: 600, color: '#8899cc' }}>{meta.author}</span>
        <span>{'\u00b7'}</span>
        <span>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
        <span>{'\u00b7'}</span>
        <span>{meta.readingTime} min read</span>
      </div>
    </div>,
    size,
  );
}
