/**
 * V41: Isometric Grid — Diamond/rhombus shapes arranged in an isometric grid pattern.
 * Subtle, architectural feel using diamond-shaped borders.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#101018';
const DIAMOND_BORDER = '#ffffff0a';
const DIAMOND_ACCENT = '#6366f115';

// Create diamond shapes using 4 border edges per diamond
// Each diamond is at grid position (col, row), offset every other row
const cellW = 80;
const cellH = 50;

interface DiamondEdge {
  left: number;
  top: number;
  width: number;
  height: number;
  isHorizontal: boolean;
}

const diamonds: DiamondEdge[] = [];

for (let row = -1; row < 14; row++) {
  for (let col = -1; col < 17; col++) {
    const offsetX = row % 2 === 0 ? 0 : cellW / 2;
    const cx = col * cellW + offsetX;
    const cy = row * cellH;

    // Top-right edge (horizontal segment)
    diamonds.push({ left: cx, top: cy, width: cellW / 2, height: 1, isHorizontal: true });
    // Top-left edge
    diamonds.push({
      left: cx - cellW / 2,
      top: cy,
      width: cellW / 2,
      height: 1,
      isHorizontal: true,
    });
    // Left vertical half
    diamonds.push({
      left: cx - cellW / 2,
      top: cy,
      width: 1,
      height: cellH / 2,
      isHorizontal: false,
    });
    // Right vertical half
    diamonds.push({
      left: cx + cellW / 2,
      top: cy,
      width: 1,
      height: cellH / 2,
      isHorizontal: false,
    });
  }
}

// Limit to a reasonable number
const visibleDiamonds = diamonds
  .filter((d) => d.left >= -10 && d.left <= 1210 && d.top >= -10 && d.top <= 640)
  .slice(0, 250);

// Accent diamonds — a few filled
const accentPositions = [
  { left: 160, top: 50, size: 30 },
  { left: 880, top: 100, size: 24 },
  { left: 400, top: 500, size: 20 },
  { left: 1040, top: 450, size: 28 },
  { left: 720, top: 30, size: 22 },
  { left: 200, top: 400, size: 26 },
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
        color: '#e0e0f0',
        padding: 60,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Isometric grid lines */}
      {visibleDiamonds.map((d, i) => (
        <div
          key={`d${i}`}
          style={{
            position: 'absolute',
            left: d.left,
            top: d.top,
            width: d.width,
            height: d.height,
            backgroundColor: DIAMOND_BORDER,
            display: 'flex',
          }}
        />
      ))}

      {/* Accent filled diamonds (squares approximation) */}
      {accentPositions.map((a, i) => (
        <div
          key={`a${i}`}
          style={{
            position: 'absolute',
            left: a.left,
            top: a.top,
            width: a.size,
            height: a.size,
            border: `1px solid ${DIAMOND_ACCENT}`,
            backgroundColor: '#6366f108',
            borderRadius: 2,
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
            color: '#9898b8',
            lineHeight: 1.4,
            maxHeight: 80,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', gap: 24, fontSize: 22, color: '#7878a0', zIndex: 1 }}>
        <span style={{ fontWeight: 600, color: '#a0a0c8' }}>{meta.author}</span>
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
