/**
 * V43: Glitch Grid — Grid lines that are interrupted, offset, or missing segments.
 * Digital glitch aesthetic with some lines in different colors (red, cyan). Dark bg.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#0a0a0c';

// Horizontal grid segments — intentionally broken/offset
const hSegments = [
  // Row 1 — broken
  { left: 0, top: 80, width: 350, color: '#ffffff0a' },
  { left: 400, top: 82, width: 280, color: '#ef444420' },
  { left: 720, top: 80, width: 480, color: '#ffffff08' },
  // Row 2 — shifted
  { left: 0, top: 160, width: 600, color: '#ffffff0a' },
  { left: 650, top: 163, width: 550, color: '#06b6d418' },
  // Row 3 — partial
  { left: 100, top: 240, width: 200, color: '#ffffff0a' },
  { left: 500, top: 240, width: 400, color: '#ffffff08' },
  { left: 950, top: 238, width: 250, color: '#ef444415' },
  // Row 4 — full but faint
  { left: 0, top: 320, width: 1200, color: '#ffffff06' },
  // Row 5 — glitched
  { left: 0, top: 400, width: 180, color: '#06b6d418' },
  { left: 220, top: 402, width: 350, color: '#ffffff0a' },
  { left: 620, top: 398, width: 200, color: '#ef444418' },
  { left: 860, top: 400, width: 340, color: '#ffffff08' },
  // Row 6
  { left: 50, top: 480, width: 500, color: '#ffffff0a' },
  { left: 600, top: 482, width: 300, color: '#06b6d415' },
  { left: 940, top: 480, width: 260, color: '#ffffff08' },
  // Row 7 — near bottom
  { left: 0, top: 560, width: 400, color: '#ffffff06' },
  { left: 500, top: 558, width: 700, color: '#ef444410' },
];

// Vertical grid segments — also broken
const vSegments = [
  { left: 100, top: 0, height: 280, color: '#ffffff08' },
  { left: 100, top: 320, height: 310, color: '#ffffff06' },
  { left: 200, top: 50, height: 580, color: '#ffffff06' },
  { left: 300, top: 0, height: 200, color: '#06b6d412' },
  { left: 302, top: 240, height: 390, color: '#ffffff08' },
  { left: 400, top: 0, height: 630, color: '#ffffff06' },
  { left: 500, top: 100, height: 250, color: '#ffffff08' },
  { left: 500, top: 400, height: 230, color: '#ef444412' },
  { left: 600, top: 0, height: 400, color: '#ffffff06' },
  { left: 602, top: 440, height: 190, color: '#06b6d415' },
  { left: 700, top: 0, height: 630, color: '#ffffff06' },
  { left: 800, top: 0, height: 160, color: '#ef444410' },
  { left: 798, top: 200, height: 430, color: '#ffffff08' },
  { left: 900, top: 50, height: 580, color: '#ffffff06' },
  { left: 1000, top: 0, height: 320, color: '#ffffff08' },
  { left: 1000, top: 360, height: 270, color: '#06b6d412' },
  { left: 1100, top: 0, height: 630, color: '#ffffff06' },
];

// Glitch artifacts — bright offset rectangles
const glitchArtifacts = [
  { left: 380, top: 78, width: 20, height: 6, color: '#ef444430' },
  { left: 640, top: 160, width: 12, height: 8, color: '#06b6d435' },
  { left: 940, top: 236, width: 16, height: 5, color: '#ef444425' },
  { left: 210, top: 400, width: 14, height: 7, color: '#06b6d430' },
  { left: 810, top: 396, width: 22, height: 6, color: '#ef444428' },
  { left: 590, top: 480, width: 12, height: 5, color: '#06b6d425' },
];

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
        color: '#e0e0e8',
        padding: 60,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Horizontal broken grid segments */}
      {hSegments.map((s, i) => (
        <div
          key={`h${i}`}
          style={{
            position: 'absolute',
            left: s.left,
            top: s.top,
            width: s.width,
            height: 1,
            backgroundColor: s.color,
            display: 'flex',
          }}
        />
      ))}

      {/* Vertical broken grid segments */}
      {vSegments.map((s, i) => (
        <div
          key={`v${i}`}
          style={{
            position: 'absolute',
            left: s.left,
            top: s.top,
            width: 1,
            height: s.height,
            backgroundColor: s.color,
            display: 'flex',
          }}
        />
      ))}

      {/* Glitch artifacts */}
      {glitchArtifacts.map((g, i) => (
        <div
          key={`g${i}`}
          style={{
            position: 'absolute',
            left: g.left,
            top: g.top,
            width: g.width,
            height: g.height,
            backgroundColor: g.color,
            display: 'flex',
          }}
        />
      ))}

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', zIndex: 1 }}>
        <img src={logoSrc} height={32} />
      </div>

      {/* Title + excerpt */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, zIndex: 1 }}>
        <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.2, color: '#ffffff' }}>
          {meta.title}
        </div>
        <div
          style={{
            fontSize: 26,
            color: '#8888a0',
            lineHeight: 1.4,
            maxHeight: 80,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', gap: 24, fontSize: 22, color: '#707088', zIndex: 1 }}>
        <span style={{ fontWeight: 600, color: '#a0a0b8' }}>{meta.author}</span>
        <span>{'\u00b7'}</span>
        <span>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
      </div>
    </div>,
    size,
  );
}
