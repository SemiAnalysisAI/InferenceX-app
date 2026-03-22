/**
 * V45: Topographic — Organic, wavy contour lines creating an elevation map effect.
 * Lines slightly waver using positioned divs with borderTop. Earthy tones.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#12110e';
const CONTOUR_A = '#a0845020';
const CONTOUR_B = '#a0845015';
const CONTOUR_C = '#a084500c';
const EARTH = '#c4956a';

// Contour lines — each is a series of short horizontal segments at slightly varying Y positions
// to create the wavy contour effect
function makeContourLine(
  baseY: number,
  color: string,
  amplitude: number,
  frequency: number,
): { left: number; top: number; width: number; color: string }[] {
  const segments: { left: number; top: number; width: number; color: string }[] = [];
  const segWidth = 30;
  for (let x = 0; x < 1200; x += segWidth) {
    // Simple wave: sin-based offset
    const wave = Math.sin((x / 1200) * Math.PI * frequency) * amplitude;
    const wave2 = Math.sin((x / 1200) * Math.PI * frequency * 2.3 + 1.5) * (amplitude * 0.4);
    segments.push({
      left: x,
      top: Math.round(baseY + wave + wave2),
      width: segWidth + 1, // +1 to avoid gaps
      color,
    });
  }
  return segments;
}

const contourLines = [
  ...makeContourLine(60, CONTOUR_C, 8, 3),
  ...makeContourLine(100, CONTOUR_B, 12, 2.5),
  ...makeContourLine(140, CONTOUR_A, 10, 4),
  ...makeContourLine(190, CONTOUR_B, 15, 2),
  ...makeContourLine(240, CONTOUR_C, 8, 3.5),
  ...makeContourLine(280, CONTOUR_A, 12, 2.8),
  ...makeContourLine(330, CONTOUR_B, 10, 3.2),
  ...makeContourLine(380, CONTOUR_C, 14, 2.2),
  ...makeContourLine(420, CONTOUR_A, 8, 4.2),
  ...makeContourLine(470, CONTOUR_B, 12, 2.6),
  ...makeContourLine(510, CONTOUR_C, 10, 3.8),
  ...makeContourLine(560, CONTOUR_A, 14, 2.4),
  ...makeContourLine(600, CONTOUR_B, 8, 3.6),
];

// Elevation markers — small circles at key intersections
const markers = [
  { left: 180, top: 135 },
  { left: 520, top: 195 },
  { left: 850, top: 280 },
  { left: 350, top: 420 },
  { left: 700, top: 470 },
  { left: 1020, top: 560 },
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
        color: '#f0e8d8',
        padding: 60,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Contour line segments */}
      {contourLines.map((seg, i) => (
        <div
          key={`c${i}`}
          style={{
            position: 'absolute',
            left: seg.left,
            top: seg.top,
            width: seg.width,
            height: 1,
            backgroundColor: seg.color,
            display: 'flex',
          }}
        />
      ))}

      {/* Elevation markers */}
      {markers.map((m, i) => (
        <div
          key={`m${i}`}
          style={{
            position: 'absolute',
            left: m.left - 3,
            top: m.top - 3,
            width: 6,
            height: 6,
            border: '1px solid #a0845025',
            borderRadius: 3,
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
            color: '#a09080',
            lineHeight: 1.4,
            maxHeight: 80,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', gap: 24, fontSize: 22, color: '#887060', zIndex: 1 }}>
        <span style={{ fontWeight: 600, color: EARTH }}>{meta.author}</span>
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
