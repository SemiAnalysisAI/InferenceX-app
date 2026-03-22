/**
 * V47: Sunset Fire — dark bg with overlapping warm-colored rectangles
 * creating a sunset horizon effect at the top. Warm glow feel.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#1a0a0a';
const ORANGE = '#ff6b35';
const RED = '#c41e3a';
const PURPLE = '#6b2fa0';

// Overlapping sunset rectangles at the top
const sunsetBlocks = [
  // Background layers — wide, spanning top
  { left: 0, top: 0, width: 1200, height: 60, color: PURPLE, opacity: 0.5 },
  { left: 0, top: 8, width: 1200, height: 40, color: RED, opacity: 0.35 },
  { left: 0, top: 20, width: 1200, height: 28, color: ORANGE, opacity: 0.25 },
  // Overlapping blocks creating depth
  { left: 0, top: 0, width: 400, height: 80, color: PURPLE, opacity: 0.6 },
  { left: 250, top: 10, width: 500, height: 65, color: RED, opacity: 0.5 },
  { left: 600, top: 5, width: 600, height: 70, color: ORANGE, opacity: 0.4 },
  { left: 100, top: 30, width: 350, height: 50, color: ORANGE, opacity: 0.35 },
  { left: 500, top: 20, width: 300, height: 55, color: PURPLE, opacity: 0.4 },
  { left: 800, top: 35, width: 400, height: 40, color: RED, opacity: 0.45 },
  // Smaller accent blocks
  { left: 0, top: 70, width: 200, height: 20, color: ORANGE, opacity: 0.2 },
  { left: 350, top: 75, width: 150, height: 15, color: RED, opacity: 0.15 },
  { left: 700, top: 68, width: 250, height: 22, color: PURPLE, opacity: 0.18 },
  { left: 1000, top: 72, width: 200, height: 18, color: ORANGE, opacity: 0.12 },
];

// Warm accent dots scattered — embers
const embers = [
  { x: 120, y: 130, size: 4, color: ORANGE, opacity: 0.2 },
  { x: 980, y: 150, size: 5, color: RED, opacity: 0.15 },
  { x: 550, y: 120, size: 3, color: ORANGE, opacity: 0.18 },
  { x: 1100, y: 180, size: 4, color: PURPLE, opacity: 0.12 },
  { x: 300, y: 160, size: 3, color: RED, opacity: 0.1 },
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
      {/* Sunset horizon blocks */}
      {sunsetBlocks.map((block, i) => (
        <div
          key={`sb${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: block.left,
            top: block.top,
            width: block.width,
            height: block.height,
            backgroundColor: block.color,
            opacity: block.opacity,
          }}
        />
      ))}

      {/* Ember dots */}
      {embers.map((e, i) => (
        <div
          key={`e${i}`}
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

      {/* Bottom warm accent line */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: 1200,
          height: 3,
          backgroundColor: ORANGE,
          opacity: 0.4,
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
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 52 }}>
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
              color: '#fff5ee',
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#c4978a',
              lineHeight: 1.5,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{ color: ORANGE, fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#5c3020', fontSize: 18 }}>/</span>
          <span style={{ color: '#9a7060', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#5c3020', fontSize: 18 }}>/</span>
          <span style={{ color: '#9a7060', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
