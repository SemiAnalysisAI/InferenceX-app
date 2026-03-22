/**
 * V54: Sandstone — dark warm grey bg with terracotta, sand, and brown accents.
 * Layered horizontal bands at edges suggesting geological strata.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#1a1714';
const TERRACOTTA = '#c45a3c';
const SAND = '#d4a853';
const BROWN = '#8b6914';

// Top geological strata — horizontal bands
const topStrata = [
  { top: 0, left: 0, width: 1200, height: 8, color: TERRACOTTA, opacity: 0.5 },
  { top: 8, left: 0, width: 1200, height: 5, color: BROWN, opacity: 0.35 },
  { top: 13, left: 0, width: 1200, height: 10, color: SAND, opacity: 0.2 },
  { top: 23, left: 0, width: 1200, height: 4, color: TERRACOTTA, opacity: 0.25 },
  { top: 27, left: 0, width: 800, height: 6, color: BROWN, opacity: 0.15 },
  { top: 33, left: 200, width: 1000, height: 3, color: SAND, opacity: 0.1 },
  { top: 36, left: 0, width: 500, height: 4, color: TERRACOTTA, opacity: 0.1 },
];

// Bottom geological strata — thicker, more prominent
const bottomStrata = [
  { bottom: 0, left: 0, width: 1200, height: 12, color: BROWN, opacity: 0.6 },
  { bottom: 12, left: 0, width: 1200, height: 8, color: TERRACOTTA, opacity: 0.45 },
  { bottom: 20, left: 0, width: 1200, height: 6, color: SAND, opacity: 0.3 },
  { bottom: 26, left: 0, width: 1200, height: 10, color: BROWN, opacity: 0.25 },
  { bottom: 36, left: 100, width: 1100, height: 5, color: TERRACOTTA, opacity: 0.2 },
  { bottom: 41, left: 0, width: 900, height: 4, color: SAND, opacity: 0.15 },
  { bottom: 45, left: 300, width: 900, height: 6, color: BROWN, opacity: 0.12 },
  { bottom: 51, left: 0, width: 600, height: 3, color: TERRACOTTA, opacity: 0.08 },
  { bottom: 54, left: 500, width: 700, height: 4, color: SAND, opacity: 0.06 },
];

// Side accent — thin vertical sediment lines
const sideLines = [
  { left: 0, top: 50, width: 3, height: 530, color: TERRACOTTA, opacity: 0.3 },
  { left: 6, top: 80, width: 2, height: 460, color: BROWN, opacity: 0.2 },
  { left: 1197, top: 50, width: 3, height: 530, color: SAND, opacity: 0.25 },
  { left: 1192, top: 100, width: 2, height: 400, color: TERRACOTTA, opacity: 0.15 },
];

// Scattered sediment fragments
const fragments = [
  { x: 40, y: 100, width: 20, height: 3, color: SAND, opacity: 0.12 },
  { x: 80, y: 160, width: 15, height: 2, color: TERRACOTTA, opacity: 0.1 },
  { x: 1100, y: 120, width: 25, height: 3, color: BROWN, opacity: 0.1 },
  { x: 1060, y: 180, width: 18, height: 2, color: SAND, opacity: 0.08 },
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
      {/* Top strata */}
      {topStrata.map((s, i) => (
        <div
          key={`ts${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: s.top,
            left: s.left,
            width: s.width,
            height: s.height,
            backgroundColor: s.color,
            opacity: s.opacity,
          }}
        />
      ))}

      {/* Bottom strata */}
      {bottomStrata.map((s, i) => (
        <div
          key={`bs${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: s.bottom,
            left: s.left,
            width: s.width,
            height: s.height,
            backgroundColor: s.color,
            opacity: s.opacity,
          }}
        />
      ))}

      {/* Side lines */}
      {sideLines.map((l, i) => (
        <div
          key={`sl${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: l.left,
            top: l.top,
            width: l.width,
            height: l.height,
            backgroundColor: l.color,
            opacity: l.opacity,
          }}
        />
      ))}

      {/* Sediment fragments */}
      {fragments.map((f, i) => (
        <div
          key={`f${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: f.x,
            top: f.y,
            width: f.width,
            height: f.height,
            backgroundColor: f.color,
            opacity: f.opacity,
            borderRadius: 1,
          }}
        />
      ))}

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '52px 56px',
          width: '100%',
          height: '100%',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} width={44} height={44} />
          <span style={{ color: SAND, fontSize: 22, marginLeft: 14, fontWeight: 600 }}>
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
              color: '#f5efe0',
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#a0907a',
              lineHeight: 1.5,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{ color: TERRACOTTA, fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#3a3028', fontSize: 18 }}>/</span>
          <span style={{ color: '#8a7a60', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#3a3028', fontSize: 18 }}>/</span>
          <span style={{ color: '#8a7a60', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
