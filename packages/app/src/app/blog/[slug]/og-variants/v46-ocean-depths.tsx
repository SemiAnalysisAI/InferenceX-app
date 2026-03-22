/**
 * V46: Ocean Depths — deep navy bg with cyan and deep teal accents.
 * Layered horizontal wave-like bars at bottom. Fluid, underwater feel.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#0a1628';
const CYAN = '#00d4ff';
const TEAL = '#006994';

// Wave bars at the bottom — layered horizontal bands with varying widths and offsets
const waveBars = [
  { bottom: 0, left: 0, width: 1200, height: 18, color: TEAL, opacity: 0.9 },
  { bottom: 18, left: 60, width: 1080, height: 10, color: CYAN, opacity: 0.15 },
  { bottom: 30, left: 0, width: 900, height: 14, color: TEAL, opacity: 0.6 },
  { bottom: 46, left: 200, width: 1000, height: 8, color: CYAN, opacity: 0.25 },
  { bottom: 56, left: 0, width: 700, height: 12, color: TEAL, opacity: 0.4 },
  { bottom: 70, left: 300, width: 900, height: 6, color: CYAN, opacity: 0.18 },
  { bottom: 80, left: 50, width: 500, height: 10, color: TEAL, opacity: 0.3 },
  { bottom: 94, left: 400, width: 800, height: 5, color: CYAN, opacity: 0.12 },
  { bottom: 102, left: 0, width: 350, height: 8, color: TEAL, opacity: 0.2 },
  { bottom: 114, left: 600, width: 600, height: 4, color: CYAN, opacity: 0.1 },
  { bottom: 122, left: 100, width: 250, height: 6, color: TEAL, opacity: 0.15 },
  { bottom: 132, left: 700, width: 500, height: 3, color: CYAN, opacity: 0.08 },
];

// Subtle floating particles for underwater atmosphere
const particles = [
  { x: 980, y: 80, size: 6, opacity: 0.12 },
  { x: 1100, y: 200, size: 4, opacity: 0.08 },
  { x: 850, y: 140, size: 5, opacity: 0.1 },
  { x: 1050, y: 320, size: 3, opacity: 0.06 },
  { x: 750, y: 60, size: 4, opacity: 0.09 },
  { x: 1140, y: 400, size: 5, opacity: 0.07 },
  { x: 900, y: 260, size: 3, opacity: 0.05 },
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
      {/* Subtle deep-water tint band at top */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: 1200,
          height: 3,
          backgroundColor: CYAN,
          opacity: 0.4,
        }}
      />

      {/* Vertical teal accent stripe on left */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: 4,
          height: 630,
          backgroundColor: TEAL,
          opacity: 0.6,
        }}
      />

      {/* Floating particles */}
      {particles.map((p, i) => (
        <div
          key={`p${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size,
            borderRadius: 9999,
            backgroundColor: CYAN,
            opacity: p.opacity,
          }}
        />
      ))}

      {/* Wave bars at bottom */}
      {waveBars.map((bar, i) => (
        <div
          key={`w${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: bar.bottom,
            left: bar.left,
            width: bar.width,
            height: bar.height,
            backgroundColor: bar.color,
            opacity: bar.opacity,
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
          <span style={{ color: CYAN, fontSize: 22, marginLeft: 14, fontWeight: 600 }}>
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
              color: '#ffffff',
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#7cb8cc',
              lineHeight: 1.5,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{ color: CYAN, fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: TEAL, fontSize: 18 }}>/</span>
          <span style={{ color: '#5a8fa3', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: TEAL, fontSize: 18 }}>/</span>
          <span style={{ color: '#5a8fa3', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
