/**
 * V86: Hexagon Cells — honeycomb pattern of hexagonal cell shapes in amber/gold tones.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

interface HexCell {
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
  border: boolean;
}

const HEX_CELLS: HexCell[] = [
  // Row 1
  { x: 40, y: 20, w: 72, h: 80, opacity: 0.08, border: false },
  { x: 150, y: 20, w: 72, h: 80, opacity: 0.12, border: true },
  { x: 260, y: 20, w: 72, h: 80, opacity: 0.06, border: false },
  { x: 370, y: 20, w: 72, h: 80, opacity: 0.1, border: true },
  { x: 480, y: 20, w: 72, h: 80, opacity: 0.07, border: false },
  { x: 590, y: 20, w: 72, h: 80, opacity: 0.14, border: true },
  { x: 700, y: 20, w: 72, h: 80, opacity: 0.05, border: false },
  { x: 810, y: 20, w: 72, h: 80, opacity: 0.11, border: true },
  { x: 920, y: 20, w: 72, h: 80, opacity: 0.08, border: false },
  { x: 1030, y: 20, w: 72, h: 80, opacity: 0.13, border: true },
  { x: 1140, y: 20, w: 72, h: 80, opacity: 0.06, border: false },
  // Row 2 offset
  { x: 95, y: 90, w: 72, h: 80, opacity: 0.1, border: true },
  { x: 205, y: 90, w: 72, h: 80, opacity: 0.06, border: false },
  { x: 315, y: 90, w: 72, h: 80, opacity: 0.15, border: true },
  { x: 425, y: 90, w: 72, h: 80, opacity: 0.08, border: false },
  { x: 535, y: 90, w: 72, h: 80, opacity: 0.12, border: true },
  { x: 645, y: 90, w: 72, h: 80, opacity: 0.07, border: false },
  { x: 755, y: 90, w: 72, h: 80, opacity: 0.1, border: true },
  { x: 865, y: 90, w: 72, h: 80, opacity: 0.14, border: false },
  { x: 975, y: 90, w: 72, h: 80, opacity: 0.06, border: true },
  { x: 1085, y: 90, w: 72, h: 80, opacity: 0.09, border: false },
  // Row 3
  { x: 40, y: 160, w: 72, h: 80, opacity: 0.12, border: true },
  { x: 150, y: 160, w: 72, h: 80, opacity: 0.07, border: false },
  { x: 260, y: 160, w: 72, h: 80, opacity: 0.1, border: true },
  { x: 810, y: 160, w: 72, h: 80, opacity: 0.09, border: false },
  { x: 920, y: 160, w: 72, h: 80, opacity: 0.13, border: true },
  { x: 1030, y: 160, w: 72, h: 80, opacity: 0.06, border: false },
  { x: 1140, y: 160, w: 72, h: 80, opacity: 0.11, border: true },
  // Row 5
  { x: 40, y: 440, w: 72, h: 80, opacity: 0.06, border: false },
  { x: 150, y: 440, w: 72, h: 80, opacity: 0.1, border: true },
  { x: 260, y: 440, w: 72, h: 80, opacity: 0.08, border: false },
  { x: 810, y: 440, w: 72, h: 80, opacity: 0.12, border: true },
  { x: 920, y: 440, w: 72, h: 80, opacity: 0.05, border: false },
  { x: 1030, y: 440, w: 72, h: 80, opacity: 0.14, border: true },
  { x: 1140, y: 440, w: 72, h: 80, opacity: 0.07, border: false },
  // Row 6 offset
  { x: 95, y: 510, w: 72, h: 80, opacity: 0.09, border: true },
  { x: 205, y: 510, w: 72, h: 80, opacity: 0.12, border: false },
  { x: 315, y: 510, w: 72, h: 80, opacity: 0.06, border: true },
  { x: 425, y: 510, w: 72, h: 80, opacity: 0.1, border: false },
  { x: 535, y: 510, w: 72, h: 80, opacity: 0.08, border: true },
  { x: 645, y: 510, w: 72, h: 80, opacity: 0.13, border: false },
  { x: 755, y: 510, w: 72, h: 80, opacity: 0.07, border: true },
  { x: 865, y: 510, w: 72, h: 80, opacity: 0.11, border: false },
  { x: 975, y: 510, w: 72, h: 80, opacity: 0.06, border: true },
  { x: 1085, y: 510, w: 72, h: 80, opacity: 0.14, border: false },
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
        backgroundColor: '#1a1207',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Hexagonal cells — approximated with tall rounded rectangles */}
      {HEX_CELLS.map((cell, i) => (
        <div
          key={`hex-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: cell.x,
            top: cell.y,
            width: cell.w,
            height: cell.h,
            borderRadius: '36px',
            backgroundColor: cell.border ? 'transparent' : '#d97706',
            border: cell.border ? '1.5px solid #d97706' : 'none',
            opacity: cell.opacity,
          }}
        />
      ))}

      {/* Warm ambient glow — top right */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: -80,
          top: -80,
          width: 400,
          height: 400,
          borderRadius: 9999,
          backgroundColor: '#92400e',
          opacity: 0.08,
        }}
      />

      {/* Warm ambient glow — bottom left */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: -60,
          bottom: -60,
          width: 300,
          height: 300,
          borderRadius: 9999,
          backgroundColor: '#b45309',
          opacity: 0.06,
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
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} width={44} height={44} />
          <span style={{ color: '#fbbf24', fontSize: 22, marginLeft: 12, fontWeight: 600 }}>
            InferenceX
          </span>
        </div>

        {/* Title & excerpt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 880 }}>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 800,
              color: '#fef3c7',
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#f59e0b',
              lineHeight: 1.5,
              opacity: 0.8,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ color: '#fbbf24', fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#78350f', fontSize: 22 }}>{'\u00b7'}</span>
          <span style={{ color: '#92400e', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#78350f', fontSize: 22 }}>{'\u00b7'}</span>
          <span style={{ color: '#92400e', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
