/**
 * V50: Volcanic Ember — near-black bg with red and orange accent elements.
 * Glowing ember dots and short lines scattered. Dramatic, intense.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#0a0504';
const RED = '#dc2626';
const ORANGE = '#f97316';

// Glowing ember dots — scattered across the image
const embers: { x: number; y: number; size: number; color: string; opacity: number }[] = [
  { x: 60, y: 80, size: 6, color: RED, opacity: 0.5 },
  { x: 180, y: 45, size: 4, color: ORANGE, opacity: 0.35 },
  { x: 320, y: 120, size: 5, color: RED, opacity: 0.3 },
  { x: 90, y: 200, size: 3, color: ORANGE, opacity: 0.25 },
  { x: 250, y: 300, size: 7, color: RED, opacity: 0.2 },
  { x: 140, y: 450, size: 4, color: ORANGE, opacity: 0.3 },
  { x: 50, y: 540, size: 5, color: RED, opacity: 0.35 },
  { x: 300, y: 500, size: 3, color: ORANGE, opacity: 0.2 },
  { x: 900, y: 50, size: 5, color: RED, opacity: 0.4 },
  { x: 1050, y: 100, size: 4, color: ORANGE, opacity: 0.3 },
  { x: 1130, y: 220, size: 6, color: RED, opacity: 0.25 },
  { x: 980, y: 350, size: 3, color: ORANGE, opacity: 0.2 },
  { x: 1100, y: 430, size: 5, color: RED, opacity: 0.35 },
  { x: 1020, y: 550, size: 4, color: ORANGE, opacity: 0.25 },
  { x: 880, y: 480, size: 3, color: RED, opacity: 0.15 },
  { x: 1160, y: 580, size: 6, color: ORANGE, opacity: 0.3 },
  // Central sparse embers
  { x: 500, y: 30, size: 3, color: RED, opacity: 0.12 },
  { x: 700, y: 580, size: 3, color: ORANGE, opacity: 0.1 },
  { x: 600, y: 600, size: 4, color: RED, opacity: 0.15 },
];

// Short glowing lines — like cracks in cooling lava
const cracks = [
  { left: 30, top: 150, width: 40, height: 2, color: RED, opacity: 0.3 },
  { left: 200, top: 250, width: 25, height: 2, color: ORANGE, opacity: 0.2 },
  { left: 100, top: 380, width: 35, height: 2, color: RED, opacity: 0.25 },
  { left: 60, top: 500, width: 30, height: 2, color: ORANGE, opacity: 0.3 },
  { left: 1000, top: 170, width: 45, height: 2, color: RED, opacity: 0.25 },
  { left: 1080, top: 310, width: 30, height: 2, color: ORANGE, opacity: 0.2 },
  { left: 950, top: 450, width: 35, height: 2, color: RED, opacity: 0.15 },
  { left: 1120, top: 520, width: 25, height: 2, color: ORANGE, opacity: 0.2 },
  // Bottom lava cracks
  { left: 0, top: 625, width: 1200, height: 3, color: RED, opacity: 0.4 },
  { left: 0, top: 627, width: 800, height: 2, color: ORANGE, opacity: 0.2 },
];

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
        backgroundColor: BG,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ember dots */}
      {embers.map((e, i) => (
        <div
          key={`em${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: e.x,
            top: e.y,
            width: e.size,
            height: e.size,
            borderRadius: 9999,
            backgroundColor: e.color,
            opacity: e.opacity,
          }}
        />
      ))}

      {/* Lava cracks */}
      {cracks.map((c, i) => (
        <div
          key={`cr${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: c.left,
            top: c.top,
            width: c.width,
            height: c.height,
            backgroundColor: c.color,
            opacity: c.opacity,
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
          <span style={{ color: ORANGE, fontSize: 22, marginLeft: 14, fontWeight: 600 }}>
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
              color: '#fff5f0',
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#a08070',
              lineHeight: 1.5,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{ color: RED, fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#4a1a10', fontSize: 18 }}>/</span>
          <span style={{ color: '#8a5a4a', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#4a1a10', fontSize: 18 }}>/</span>
          <span style={{ color: '#8a5a4a', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
