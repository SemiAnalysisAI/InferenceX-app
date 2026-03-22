/**
 * V48: Forest Canopy — very dark green bg with scattered vertical rectangles
 * of varying greens simulating tree trunks and leaves. Organic, natural.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#0a1a0a';
const DARK_GREEN = '#1a5c1a';
const MID_GREEN = '#2d8a2d';
const LIGHT_GREEN = '#4caf50';

// Tree trunk-like vertical rectangles
const trunks = [
  { left: 30, top: 0, width: 12, height: 630, color: DARK_GREEN, opacity: 0.5 },
  { left: 80, top: 80, width: 8, height: 550, color: MID_GREEN, opacity: 0.3 },
  { left: 160, top: 0, width: 14, height: 400, color: DARK_GREEN, opacity: 0.35 },
  { left: 250, top: 200, width: 10, height: 430, color: MID_GREEN, opacity: 0.25 },
  { left: 950, top: 0, width: 16, height: 630, color: DARK_GREEN, opacity: 0.45 },
  { left: 1020, top: 50, width: 10, height: 580, color: MID_GREEN, opacity: 0.3 },
  { left: 1100, top: 0, width: 12, height: 500, color: DARK_GREEN, opacity: 0.4 },
  { left: 1160, top: 120, width: 8, height: 510, color: MID_GREEN, opacity: 0.2 },
];

// Leaf-like scattered rectangles (small, various positions)
const leaves = [
  { left: 20, top: 40, width: 35, height: 8, color: LIGHT_GREEN, opacity: 0.15 },
  { left: 60, top: 70, width: 28, height: 6, color: MID_GREEN, opacity: 0.2 },
  { left: 140, top: 20, width: 40, height: 7, color: LIGHT_GREEN, opacity: 0.12 },
  { left: 100, top: 110, width: 22, height: 5, color: MID_GREEN, opacity: 0.18 },
  { left: 200, top: 60, width: 30, height: 8, color: DARK_GREEN, opacity: 0.25 },
  { left: 920, top: 30, width: 45, height: 8, color: LIGHT_GREEN, opacity: 0.14 },
  { left: 980, top: 90, width: 30, height: 6, color: MID_GREEN, opacity: 0.2 },
  { left: 1050, top: 45, width: 38, height: 7, color: LIGHT_GREEN, opacity: 0.1 },
  { left: 1080, top: 100, width: 25, height: 5, color: MID_GREEN, opacity: 0.16 },
  { left: 1130, top: 70, width: 32, height: 6, color: DARK_GREEN, opacity: 0.22 },
  // Bottom scattered foliage
  { left: 40, top: 560, width: 50, height: 10, color: LIGHT_GREEN, opacity: 0.12 },
  { left: 150, top: 580, width: 35, height: 8, color: MID_GREEN, opacity: 0.1 },
  { left: 960, top: 570, width: 40, height: 9, color: LIGHT_GREEN, opacity: 0.1 },
  { left: 1070, top: 550, width: 30, height: 7, color: MID_GREEN, opacity: 0.08 },
];

// Small dot-like elements representing forest floor
const dots = [
  { x: 50, y: 600, size: 4, opacity: 0.15 },
  { x: 120, y: 610, size: 3, opacity: 0.1 },
  { x: 200, y: 595, size: 5, opacity: 0.08 },
  { x: 1000, y: 605, size: 4, opacity: 0.12 },
  { x: 1120, y: 590, size: 3, opacity: 0.1 },
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
      {/* Tree trunks */}
      {trunks.map((t, i) => (
        <div
          key={`t${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: t.left,
            top: t.top,
            width: t.width,
            height: t.height,
            backgroundColor: t.color,
            opacity: t.opacity,
          }}
        />
      ))}

      {/* Leaf rectangles */}
      {leaves.map((l, i) => (
        <div
          key={`l${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: l.left,
            top: l.top,
            width: l.width,
            height: l.height,
            backgroundColor: l.color,
            opacity: l.opacity,
            borderRadius: 2,
          }}
        />
      ))}

      {/* Forest floor dots */}
      {dots.map((d, i) => (
        <div
          key={`d${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: d.x,
            top: d.y,
            width: d.size,
            height: d.size,
            borderRadius: 9999,
            backgroundColor: LIGHT_GREEN,
            opacity: d.opacity,
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
          <span style={{ color: LIGHT_GREEN, fontSize: 22, marginLeft: 14, fontWeight: 600 }}>
            InferenceX
          </span>
        </div>

        {/* Title & excerpt */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            maxWidth: 850,
            marginLeft: 40,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 800,
              color: '#e8f5e9',
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#81a784',
              lineHeight: 1.5,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{ color: LIGHT_GREEN, fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#2e5c2e', fontSize: 18 }}>/</span>
          <span style={{ color: '#6b9a6b', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#2e5c2e', fontSize: 18 }}>/</span>
          <span style={{ color: '#6b9a6b', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
