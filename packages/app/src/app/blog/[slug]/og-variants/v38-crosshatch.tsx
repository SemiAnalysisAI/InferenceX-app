/**
 * V38: Crosshatch — Diagonal line segments crossing in both directions,
 * creating a woven/textile feel. Simulated with short positioned line segments.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#121216';
const HATCH_COLOR_A = '#ffffff08';
const HATCH_COLOR_B = '#ffffff06';

// Forward-slash diagonal segments (top-left to bottom-right) — short horizontal lines offset
const forwardLines: { left: number; top: number; width: number }[] = [];
for (let col = -2; col < 30; col++) {
  for (let row = 0; row < 16; row++) {
    forwardLines.push({
      left: col * 45 + row * 3,
      top: row * 40,
      width: 35,
    });
  }
}

// Backslash diagonal segments (top-right to bottom-left) — perpendicular set
const backLines: { left: number; top: number; height: number }[] = [];
for (let col = 0; col < 28; col++) {
  for (let row = -2; row < 18; row++) {
    backLines.push({
      left: col * 45 + row * 3,
      top: row * 40,
      height: 35,
    });
  }
}

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  // Limit the number of elements for perf — take a subset that covers the canvas
  const fwdSubset = forwardLines.filter((_, i) => i % 3 === 0).slice(0, 80);
  const bkSubset = backLines.filter((_, i) => i % 3 === 0).slice(0, 80);

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        backgroundColor: BG,
        color: '#e8e8ec',
        padding: 60,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Forward hatch lines (horizontal segments, staggered) */}
      {fwdSubset.map((l, i) => (
        <div
          key={`f${i}`}
          style={{
            position: 'absolute',
            left: l.left,
            top: l.top,
            width: l.width,
            height: 1,
            backgroundColor: HATCH_COLOR_A,
            display: 'flex',
          }}
        />
      ))}

      {/* Back hatch lines (vertical segments, staggered) */}
      {bkSubset.map((l, i) => (
        <div
          key={`b${i}`}
          style={{
            position: 'absolute',
            left: l.left,
            top: l.top,
            width: 1,
            height: l.height,
            backgroundColor: HATCH_COLOR_B,
            display: 'flex',
          }}
        />
      ))}

      {/* Accent crosshatch nodes at intersections */}
      {Array.from({ length: 12 }, (_, i) => (
        <div
          key={`n${i}`}
          style={{
            position: 'absolute',
            left: 90 + i * 95,
            top: 40 + (i % 3) * 180,
            width: 4,
            height: 4,
            backgroundColor: '#7c3aed30',
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
            color: '#9898a8',
            lineHeight: 1.4,
            maxHeight: 80,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', gap: 24, fontSize: 22, color: '#8888a0', zIndex: 1 }}>
        <span style={{ fontWeight: 600, color: '#c0c0d0' }}>{meta.author}</span>
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
