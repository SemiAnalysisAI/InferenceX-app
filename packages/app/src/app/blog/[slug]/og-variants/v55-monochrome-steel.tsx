/**
 * V55: Monochrome Steel — pure grey palette only. Multiple grey rectangles
 * creating an industrial steel plate effect. No color at all.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#0e0e0e';

// Steel plate panels — overlapping grey rectangles creating industrial depth
const plates = [
  // Large background plates
  { left: 0, top: 0, width: 400, height: 630, color: '#1a1a1a', opacity: 0.8 },
  { left: 800, top: 0, width: 400, height: 630, color: '#1a1a1a', opacity: 0.6 },
  // Mid-tone plates
  { left: 380, top: 0, width: 40, height: 630, color: '#2a2a2a', opacity: 0.5 },
  { left: 780, top: 0, width: 40, height: 630, color: '#2a2a2a', opacity: 0.5 },
  // Horizontal plate joints
  { left: 0, top: 0, width: 1200, height: 4, color: '#4a4a4a', opacity: 0.6 },
  { left: 0, top: 626, width: 1200, height: 4, color: '#4a4a4a', opacity: 0.6 },
  { left: 0, top: 200, width: 1200, height: 2, color: '#2a2a2a', opacity: 0.3 },
  { left: 0, top: 430, width: 1200, height: 2, color: '#2a2a2a', opacity: 0.3 },
  // Vertical plate seams
  { left: 0, top: 0, width: 3, height: 630, color: '#4a4a4a', opacity: 0.5 },
  { left: 1197, top: 0, width: 3, height: 630, color: '#4a4a4a', opacity: 0.5 },
];

// Bolt/rivet positions at plate intersections
const bolts = [
  // Top row
  { x: 15, y: 15, size: 8 },
  { x: 395, y: 15, size: 8 },
  { x: 415, y: 15, size: 8 },
  { x: 795, y: 15, size: 8 },
  { x: 815, y: 15, size: 8 },
  { x: 1177, y: 15, size: 8 },
  // Bottom row
  { x: 15, y: 607, size: 8 },
  { x: 395, y: 607, size: 8 },
  { x: 415, y: 607, size: 8 },
  { x: 795, y: 607, size: 8 },
  { x: 815, y: 607, size: 8 },
  { x: 1177, y: 607, size: 8 },
  // Mid row
  { x: 15, y: 197, size: 6 },
  { x: 1177, y: 197, size: 6 },
  { x: 15, y: 427, size: 6 },
  { x: 1177, y: 427, size: 6 },
];

// Surface texture — short horizontal scratches
const scratches = [
  { left: 50, top: 80, width: 40, height: 1, opacity: 0.08 },
  { left: 200, top: 150, width: 30, height: 1, opacity: 0.06 },
  { left: 500, top: 100, width: 50, height: 1, opacity: 0.05 },
  { left: 900, top: 130, width: 35, height: 1, opacity: 0.07 },
  { left: 1050, top: 60, width: 45, height: 1, opacity: 0.06 },
  { left: 100, top: 500, width: 30, height: 1, opacity: 0.05 },
  { left: 700, top: 520, width: 40, height: 1, opacity: 0.04 },
  { left: 1000, top: 480, width: 35, height: 1, opacity: 0.06 },
];

// Highlight edges — subtle bright lines on plate edges for depth
const highlights = [
  { left: 400, top: 4, width: 1, height: 194, color: '#4a4a4a', opacity: 0.4 },
  { left: 800, top: 4, width: 1, height: 194, color: '#4a4a4a', opacity: 0.4 },
  { left: 400, top: 204, width: 1, height: 224, color: '#4a4a4a', opacity: 0.3 },
  { left: 800, top: 204, width: 1, height: 224, color: '#4a4a4a', opacity: 0.3 },
  { left: 400, top: 434, width: 1, height: 192, color: '#4a4a4a', opacity: 0.35 },
  { left: 800, top: 434, width: 1, height: 192, color: '#4a4a4a', opacity: 0.35 },
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
      {/* Steel plates */}
      {plates.map((p, i) => (
        <div
          key={`p${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: p.left,
            top: p.top,
            width: p.width,
            height: p.height,
            backgroundColor: p.color,
            opacity: p.opacity,
          }}
        />
      ))}

      {/* Highlight edges */}
      {highlights.map((h, i) => (
        <div
          key={`h${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: h.left,
            top: h.top,
            width: 1,
            height: h.height,
            backgroundColor: h.color,
            opacity: h.opacity,
          }}
        />
      ))}

      {/* Bolts */}
      {bolts.map((b, i) => (
        <div
          key={`b${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: b.x,
            top: b.y,
            width: b.size,
            height: b.size,
            borderRadius: 9999,
            backgroundColor: '#4a4a4a',
            opacity: 0.5,
          }}
        />
      ))}

      {/* Surface scratches */}
      {scratches.map((s, i) => (
        <div
          key={`s${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: s.left,
            top: s.top,
            width: s.width,
            height: s.height,
            backgroundColor: '#7a7a7a',
            opacity: s.opacity,
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
          <span style={{ color: '#aaaaaa', fontSize: 22, marginLeft: 14, fontWeight: 600 }}>
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
              color: '#e8e8e8',
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#7a7a7a',
              lineHeight: 1.5,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{ color: '#aaaaaa', fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#333333', fontSize: 18 }}>/</span>
          <span style={{ color: '#7a7a7a', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#333333', fontSize: 18 }}>/</span>
          <span style={{ color: '#7a7a7a', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
