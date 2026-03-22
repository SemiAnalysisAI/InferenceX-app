/**
 * V44: Perspective Lines — Lines converging toward a vanishing point, creating
 * depth illusion. Lines spread from center-bottom outward. Subtle dark grey on darker bg.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#08080c';
const LINE_COLOR = '#ffffff08';
const LINE_BRIGHT = '#ffffff10';

// Vanishing point at center-bottom
const vpX = 600;
const vpY = 580;

// Generate perspective lines from vanishing point outward to top edge
// Each line goes from VP to a point along the top/sides
const perspectiveTargets: { x: number; y: number }[] = [];

// Fan across the top edge
for (let i = 0; i <= 24; i++) {
  perspectiveTargets.push({ x: i * 50, y: 0 });
}

// A few to the sides at mid-height
perspectiveTargets.push({ x: 0, y: 150 });
perspectiveTargets.push({ x: 0, y: 300 });
perspectiveTargets.push({ x: 0, y: 450 });
perspectiveTargets.push({ x: 1200, y: 150 });
perspectiveTargets.push({ x: 1200, y: 300 });
perspectiveTargets.push({ x: 1200, y: 450 });

// For each line, create segments from VP to target
function lineSegments(tx: number, ty: number, count: number) {
  const segs: { left: number; top: number; width: number; height: number }[] = [];
  for (let s = 0; s < count; s++) {
    const t0 = s / count;
    const t1 = (s + 1) / count;
    const x0 = vpX + (tx - vpX) * t0;
    const y0 = vpY + (ty - vpY) * t0;
    const x1 = vpX + (tx - vpX) * t1;
    const y1 = vpY + (ty - vpY) * t1;
    segs.push({
      left: Math.round(Math.min(x0, x1)),
      top: Math.round(Math.min(y0, y1)),
      width: Math.max(1, Math.round(Math.abs(x1 - x0))),
      height: Math.max(1, Math.round(Math.abs(y1 - y0))),
    });
  }
  return segs;
}

const allLineSegs = perspectiveTargets.flatMap((t, ti) =>
  lineSegments(t.x, t.y, 15).map((seg) => ({
    ...seg,
    color: ti % 4 === 0 ? LINE_BRIGHT : LINE_COLOR,
  })),
);

// Horizontal perspective lines — getting closer together toward VP
const horizLines = [
  { top: 100, color: LINE_COLOR },
  { top: 200, color: LINE_BRIGHT },
  { top: 300, color: LINE_COLOR },
  { top: 400, color: LINE_COLOR },
  { top: 480, color: LINE_BRIGHT },
  { top: 540, color: LINE_COLOR },
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
        color: '#d8d8e0',
        padding: 60,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Converging line segments */}
      {allLineSegs.map((seg, i) => (
        <div
          key={`l${i}`}
          style={{
            position: 'absolute',
            left: seg.left,
            top: seg.top,
            width: seg.width,
            height: seg.height,
            backgroundColor: seg.color,
            display: 'flex',
          }}
        />
      ))}

      {/* Horizontal perspective lines */}
      {horizLines.map((h, i) => (
        <div
          key={`h${i}`}
          style={{
            position: 'absolute',
            left: 0,
            top: h.top,
            width: 1200,
            height: 1,
            backgroundColor: h.color,
            display: 'flex',
          }}
        />
      ))}

      {/* Vanishing point marker */}
      <div
        style={{
          position: 'absolute',
          left: vpX - 3,
          top: vpY - 3,
          width: 6,
          height: 6,
          backgroundColor: '#ffffff15',
          borderRadius: 3,
          display: 'flex',
        }}
      />

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
        <span style={{ fontWeight: 600, color: '#a8a8c0' }}>{meta.author}</span>
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
