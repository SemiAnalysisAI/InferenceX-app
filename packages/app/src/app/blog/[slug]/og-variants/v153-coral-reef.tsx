/**
 * V153: Coral Reef — Deep ocean blue bg with organic coral shapes at the bottom
 * (rounded rectangles and circles in coral colors) and bubbles floating upward.
 * Underwater/marine biology aesthetic.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#061425';
const PINK = '#ff7eb3';
const ORANGE = '#ff6b35';
const YELLOW = '#ffd700';
const TEAL = '#20b2aa';

// Coral formations at the bottom
const corals: {
  left: number;
  bottom: number;
  width: number;
  height: number;
  color: string;
  radius: number;
}[] = [
  // Base layer — wide flat corals
  { left: -20, bottom: -10, width: 180, height: 80, color: `${PINK}30`, radius: 40 },
  { left: 140, bottom: -5, width: 120, height: 100, color: `${ORANGE}35`, radius: 50 },
  { left: 240, bottom: -8, width: 160, height: 70, color: `${TEAL}28`, radius: 35 },
  { left: 380, bottom: -10, width: 140, height: 90, color: `${PINK}25`, radius: 45 },
  { left: 500, bottom: -5, width: 100, height: 110, color: `${YELLOW}22`, radius: 50 },
  { left: 580, bottom: -8, width: 180, height: 75, color: `${ORANGE}28`, radius: 38 },
  { left: 740, bottom: -10, width: 130, height: 95, color: `${TEAL}30`, radius: 48 },
  { left: 850, bottom: -5, width: 160, height: 80, color: `${PINK}25`, radius: 40 },
  { left: 990, bottom: -8, width: 120, height: 100, color: `${YELLOW}28`, radius: 50 },
  { left: 1090, bottom: -10, width: 130, height: 85, color: `${ORANGE}30`, radius: 42 },
  // Second layer — taller coral pillars
  { left: 60, bottom: 60, width: 60, height: 80, color: `${PINK}20`, radius: 30 },
  { left: 200, bottom: 55, width: 50, height: 100, color: `${TEAL}22`, radius: 25 },
  { left: 340, bottom: 50, width: 70, height: 70, color: `${ORANGE}18`, radius: 35 },
  { left: 520, bottom: 65, width: 55, height: 90, color: `${YELLOW}20`, radius: 28 },
  { left: 680, bottom: 55, width: 65, height: 75, color: `${PINK}22`, radius: 32 },
  { left: 820, bottom: 60, width: 50, height: 85, color: `${TEAL}18`, radius: 25 },
  { left: 960, bottom: 50, width: 60, height: 70, color: `${ORANGE}20`, radius: 30 },
  // Top spherical corals (brain coral look)
  { left: 120, bottom: 120, width: 40, height: 40, color: `${PINK}15`, radius: 20 },
  { left: 450, bottom: 130, width: 35, height: 35, color: `${YELLOW}15`, radius: 18 },
  { left: 750, bottom: 115, width: 45, height: 45, color: `${TEAL}15`, radius: 22 },
  { left: 1020, bottom: 125, width: 38, height: 38, color: `${ORANGE}15`, radius: 19 },
];

// Bubbles floating upward
const bubbles: { x: number; y: number; size: number; opacity: number }[] = [
  { x: 100, y: 380, size: 12, opacity: 0.15 },
  { x: 250, y: 300, size: 8, opacity: 0.12 },
  { x: 380, y: 350, size: 10, opacity: 0.1 },
  { x: 520, y: 280, size: 6, opacity: 0.08 },
  { x: 650, y: 320, size: 14, opacity: 0.12 },
  { x: 780, y: 260, size: 8, opacity: 0.1 },
  { x: 900, y: 340, size: 10, opacity: 0.14 },
  { x: 1050, y: 290, size: 7, opacity: 0.09 },
  { x: 180, y: 200, size: 5, opacity: 0.06 },
  { x: 450, y: 180, size: 8, opacity: 0.08 },
  { x: 700, y: 160, size: 6, opacity: 0.06 },
  { x: 950, y: 190, size: 9, opacity: 0.07 },
  { x: 320, y: 420, size: 11, opacity: 0.16 },
  { x: 850, y: 400, size: 9, opacity: 0.13 },
];

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        width: '100%',
        height: '100%',
        backgroundColor: BG,
        color: '#d0e8f0',
        padding: 60,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Water depth gradient (layered bands) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: 1200,
          height: 200,
          backgroundColor: '#041020',
          display: 'flex',
        }}
      />

      {/* Coral formations */}
      {corals.map((c, i) => (
        <div
          key={`c${i}`}
          style={{
            position: 'absolute',
            left: c.left,
            bottom: c.bottom,
            width: c.width,
            height: c.height,
            backgroundColor: c.color,
            borderRadius: c.radius,
            display: 'flex',
          }}
        />
      ))}

      {/* Bubbles */}
      {bubbles.map((b, i) => (
        <div
          key={`b${i}`}
          style={{
            position: 'absolute',
            left: b.x - b.size / 2,
            top: b.y - b.size / 2,
            width: b.size,
            height: b.size,
            borderRadius: b.size / 2,
            border: '1px solid #ffffff',
            opacity: b.opacity,
            display: 'flex',
          }}
        />
      ))}

      {/* Caustic light streaks from surface */}
      {[
        { left: 100, width: 2, opacity: 0.03 },
        { left: 350, width: 3, opacity: 0.04 },
        { left: 600, width: 2, opacity: 0.03 },
        { left: 850, width: 3, opacity: 0.04 },
        { left: 1050, width: 2, opacity: 0.03 },
      ].map((ray, i) => (
        <div
          key={`ray${i}`}
          style={{
            position: 'absolute',
            left: ray.left,
            top: 0,
            width: ray.width,
            height: 400,
            backgroundColor: '#ffffff',
            opacity: ray.opacity,
            display: 'flex',
          }}
        />
      ))}

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', zIndex: 1 }}>
        <img src={logoSrc} height={32} />
      </div>

      {/* Title + excerpt */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          zIndex: 1,
          marginTop: 40,
        }}
      >
        <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.2, color: '#ffffff' }}>
          {meta.title}
        </div>
        <div
          style={{
            fontSize: 26,
            color: '#6090b0',
            lineHeight: 1.4,
            maxHeight: 80,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          gap: 24,
          fontSize: 22,
          color: '#4080a0',
          zIndex: 1,
          marginTop: 'auto',
          paddingTop: 20,
        }}
      >
        <span style={{ fontWeight: 600, color: TEAL }}>{meta.author}</span>
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
                backgroundColor: '#0a1830',
                padding: '4px 12px',
                borderRadius: 9999,
                fontSize: 18,
                color: TEAL,
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
