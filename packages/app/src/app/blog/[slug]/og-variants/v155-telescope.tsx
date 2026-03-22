/**
 * V155: Telescope — Dark bg with a large centered circle (telescope eyepiece view).
 * Content inside the circle, pure black outside, thin crosshair lines through center,
 * and coordinate numbers at intersections. Observatory feel.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#000000';
const EYEPIECE_BG = '#080810';
const CROSSHAIR = '#ffffff18';
const COORD_COLOR = '#ffffff20';
const ACCENT = '#6699dd';

// Stars visible through the telescope
const telescopeStars: { x: number; y: number; size: number; opacity: number }[] = [
  { x: 460, y: 180, size: 2, opacity: 0.4 },
  { x: 580, y: 150, size: 1, opacity: 0.3 },
  { x: 700, y: 200, size: 3, opacity: 0.5 },
  { x: 520, y: 250, size: 1, opacity: 0.25 },
  { x: 650, y: 280, size: 2, opacity: 0.35 },
  { x: 750, y: 160, size: 1, opacity: 0.3 },
  { x: 490, y: 380, size: 2, opacity: 0.4 },
  { x: 620, y: 420, size: 1, opacity: 0.25 },
  { x: 730, y: 370, size: 2, opacity: 0.35 },
  { x: 550, y: 440, size: 1, opacity: 0.2 },
  { x: 680, y: 460, size: 2, opacity: 0.3 },
];

// Eyepiece circle center and radius
const CX = 600;
const CY = 315;
const RADIUS = 260;

// Corner vignette blocks to create the circular mask effect
// We use rectangles positioned around the circle to create the illusion
const _vignetteBlocks: { left: number; top: number; width: number; height: number }[] = [
  // Top strip
  { left: 0, top: 0, width: 1200, height: CY - RADIUS },
  // Bottom strip
  { left: 0, top: CY + RADIUS, width: 1200, height: 630 - (CY + RADIUS) },
  // Left strip
  { left: 0, top: CY - RADIUS, width: CX - RADIUS, height: RADIUS * 2 },
  // Right strip
  { left: CX + RADIUS, top: CY - RADIUS, width: 1200 - (CX + RADIUS), height: RADIUS * 2 },
  // Corner fill — approximate circle with 8 additional corner rectangles
  // Top-left corner
  { left: CX - RADIUS, top: CY - RADIUS, width: 76, height: 76 },
  { left: CX - RADIUS, top: CY - RADIUS + 76, width: 30, height: 50 },
  { left: CX - RADIUS + 76, top: CY - RADIUS, width: 50, height: 30 },
  // Top-right corner
  { left: CX + RADIUS - 76, top: CY - RADIUS, width: 76, height: 76 },
  { left: CX + RADIUS - 30, top: CY - RADIUS + 76, width: 30, height: 50 },
  { left: CX + RADIUS - 126, top: CY - RADIUS, width: 50, height: 30 },
  // Bottom-left corner
  { left: CX - RADIUS, top: CY + RADIUS - 76, width: 76, height: 76 },
  { left: CX - RADIUS, top: CY + RADIUS - 126, width: 30, height: 50 },
  { left: CX - RADIUS + 76, top: CY + RADIUS - 30, width: 50, height: 30 },
  // Bottom-right corner
  { left: CX + RADIUS - 76, top: CY + RADIUS - 76, width: 76, height: 76 },
  { left: CX + RADIUS - 30, top: CY + RADIUS - 126, width: 30, height: 50 },
  { left: CX + RADIUS - 126, top: CY + RADIUS - 30, width: 50, height: 30 },
];

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 36 : meta.title.length > 40 ? 42 : 48;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: BG,
        color: '#c0c8e0',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Eyepiece background circle */}
      <div
        style={{
          position: 'absolute',
          left: CX - RADIUS,
          top: CY - RADIUS,
          width: RADIUS * 2,
          height: RADIUS * 2,
          borderRadius: RADIUS,
          backgroundColor: EYEPIECE_BG,
          border: `2px solid #ffffff10`,
          display: 'flex',
        }}
      />

      {/* Thin outer ring */}
      <div
        style={{
          position: 'absolute',
          left: CX - RADIUS - 8,
          top: CY - RADIUS - 8,
          width: RADIUS * 2 + 16,
          height: RADIUS * 2 + 16,
          borderRadius: RADIUS + 8,
          border: '1px solid #ffffff08',
          display: 'flex',
        }}
      />

      {/* Stars through eyepiece */}
      {telescopeStars.map((s, i) => (
        <div
          key={`s${i}`}
          style={{
            position: 'absolute',
            left: s.x,
            top: s.y,
            width: s.size,
            height: s.size,
            borderRadius: s.size / 2,
            backgroundColor: '#ffffff',
            opacity: s.opacity,
            display: 'flex',
          }}
        />
      ))}

      {/* Crosshair — horizontal line */}
      <div
        style={{
          position: 'absolute',
          left: CX - RADIUS + 20,
          top: CY,
          width: (RADIUS - 20) * 2,
          height: 1,
          backgroundColor: CROSSHAIR,
          display: 'flex',
        }}
      />

      {/* Crosshair — vertical line */}
      <div
        style={{
          position: 'absolute',
          left: CX,
          top: CY - RADIUS + 20,
          width: 1,
          height: (RADIUS - 20) * 2,
          backgroundColor: CROSSHAIR,
          display: 'flex',
        }}
      />

      {/* Crosshair center tick marks */}
      {/* Left tick */}
      <div
        style={{
          position: 'absolute',
          left: CX - 20,
          top: CY - 6,
          width: 1,
          height: 12,
          backgroundColor: '#ffffff25',
          display: 'flex',
        }}
      />
      {/* Right tick */}
      <div
        style={{
          position: 'absolute',
          left: CX + 20,
          top: CY - 6,
          width: 1,
          height: 12,
          backgroundColor: '#ffffff25',
          display: 'flex',
        }}
      />
      {/* Top tick */}
      <div
        style={{
          position: 'absolute',
          left: CX - 6,
          top: CY - 20,
          width: 12,
          height: 1,
          backgroundColor: '#ffffff25',
          display: 'flex',
        }}
      />
      {/* Bottom tick */}
      <div
        style={{
          position: 'absolute',
          left: CX - 6,
          top: CY + 20,
          width: 12,
          height: 1,
          backgroundColor: '#ffffff25',
          display: 'flex',
        }}
      />

      {/* Coordinate numbers at crosshair intersections */}
      <div
        style={{
          position: 'absolute',
          left: CX + 6,
          top: CY - 20,
          fontSize: 10,
          color: COORD_COLOR,
          display: 'flex',
        }}
      >
        0,0
      </div>
      <div
        style={{
          position: 'absolute',
          left: CX - RADIUS + 30,
          top: CY + 4,
          fontSize: 10,
          color: COORD_COLOR,
          display: 'flex',
        }}
      >
        -260
      </div>
      <div
        style={{
          position: 'absolute',
          left: CX + RADIUS - 60,
          top: CY + 4,
          fontSize: 10,
          color: COORD_COLOR,
          display: 'flex',
        }}
      >
        +260
      </div>

      {/* Content inside the eyepiece */}
      <div
        style={{
          position: 'absolute',
          left: CX - 200,
          top: CY - 100,
          width: 400,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          zIndex: 2,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <img src={logoSrc} height={24} />
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: titleSize,
            fontWeight: 700,
            lineHeight: 1.2,
            color: '#ffffff',
            textAlign: 'center',
            display: 'flex',
          }}
        >
          {meta.title.length > 60 ? meta.title.slice(0, 60) + '\u2026' : meta.title}
        </div>

        {/* Excerpt */}
        <div
          style={{
            fontSize: 18,
            color: '#7080a0',
            lineHeight: 1.4,
            textAlign: 'center',
            maxHeight: 50,
            overflow: 'hidden',
            display: 'flex',
          }}
        >
          {meta.excerpt.length > 80 ? meta.excerpt.slice(0, 80) + '\u2026' : meta.excerpt}
        </div>
      </div>

      {/* Footer — outside the circle, bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          gap: 24,
          fontSize: 18,
          color: '#404860',
          zIndex: 2,
        }}
      >
        <span style={{ fontWeight: 600, color: ACCENT }}>{meta.author}</span>
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
        {meta.tags &&
          meta.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              style={{
                backgroundColor: '#0a0a18',
                padding: '3px 10px',
                borderRadius: 9999,
                fontSize: 14,
                color: ACCENT,
                border: '1px solid #1a1a30',
              }}
            >
              {tag}
            </span>
          ))}
      </div>
    </div>,
    size,
  );
}
