/**
 * V80: Network Nodes — Network topology with positioned circle nodes connected
 * by thin lines. Cyan nodes on dark background. Content overlaid.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

// Network nodes
const nodes = [
  { x: 60, y: 50, s: 14, opacity: 0.6 },
  { x: 200, y: 100, s: 18, opacity: 0.8 },
  { x: 150, y: 250, s: 12, opacity: 0.5 },
  { x: 350, y: 60, s: 16, opacity: 0.7 },
  { x: 500, y: 30, s: 12, opacity: 0.4 },
  { x: 700, y: 70, s: 20, opacity: 0.9 },
  { x: 900, y: 50, s: 14, opacity: 0.6 },
  { x: 1050, y: 100, s: 16, opacity: 0.7 },
  { x: 1140, y: 60, s: 12, opacity: 0.5 },
  { x: 80, y: 450, s: 16, opacity: 0.6 },
  { x: 250, y: 530, s: 14, opacity: 0.5 },
  { x: 450, y: 500, s: 18, opacity: 0.7 },
  { x: 600, y: 560, s: 12, opacity: 0.4 },
  { x: 800, y: 520, s: 16, opacity: 0.8 },
  { x: 950, y: 480, s: 14, opacity: 0.6 },
  { x: 1100, y: 540, s: 20, opacity: 0.7 },
  { x: 30, y: 300, s: 12, opacity: 0.3 },
  { x: 1160, y: 320, s: 14, opacity: 0.4 },
];

// Connection lines (horizontal and vertical segments)
const hLines = [
  { x: 67, y: 57, w: 133, opacity: 0.15 },
  { x: 207, y: 109, w: 143, opacity: 0.12 },
  { x: 366, y: 68, w: 134, opacity: 0.1 },
  { x: 512, y: 36, w: 188, opacity: 0.08 },
  { x: 720, y: 78, w: 180, opacity: 0.14 },
  { x: 914, y: 57, w: 136, opacity: 0.1 },
  { x: 1066, y: 108, w: 74, opacity: 0.12 },
  { x: 96, y: 458, w: 154, opacity: 0.13 },
  { x: 264, y: 537, w: 186, opacity: 0.1 },
  { x: 468, y: 508, w: 132, opacity: 0.11 },
  { x: 612, y: 566, w: 188, opacity: 0.09 },
  { x: 816, y: 528, w: 134, opacity: 0.14 },
  { x: 964, y: 488, w: 136, opacity: 0.12 },
];

const vLines = [
  { x: 67, y: 64, h: 186, opacity: 0.1 },
  { x: 207, y: 118, h: 132, opacity: 0.08 },
  { x: 157, y: 262, h: 188, opacity: 0.07 },
  { x: 707, y: 90, h: 170, opacity: 0.1 },
  { x: 1057, y: 116, h: 204, opacity: 0.09 },
  { x: 87, y: 306, h: 144, opacity: 0.08 },
  { x: 807, y: 360, h: 160, opacity: 0.1 },
  { x: 1107, y: 380, h: 160, opacity: 0.09 },
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
        backgroundColor: '#080c14',
        color: '#ffffff',
        padding: 60,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Connection lines (horizontal) */}
      {hLines.map((l, i) => (
        <div
          key={`hl${i}`}
          style={{
            position: 'absolute',
            left: l.x,
            top: l.y,
            width: l.w,
            height: 1,
            backgroundColor: '#00d4ff',
            opacity: l.opacity,
            display: 'flex',
          }}
        />
      ))}

      {/* Connection lines (vertical) */}
      {vLines.map((l, i) => (
        <div
          key={`vl${i}`}
          style={{
            position: 'absolute',
            left: l.x,
            top: l.y,
            width: 1,
            height: l.h,
            backgroundColor: '#00d4ff',
            opacity: l.opacity,
            display: 'flex',
          }}
        />
      ))}

      {/* Nodes */}
      {nodes.map((n, i) => (
        <div
          key={`nd${i}`}
          style={{
            position: 'absolute',
            left: n.x,
            top: n.y,
            width: n.s,
            height: n.s,
            borderRadius: 9999,
            backgroundColor: '#00d4ff',
            opacity: n.opacity * 0.3,
            border: '2px solid #00d4ff',
            display: 'flex',
          }}
        />
      ))}

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', zIndex: 2 }}>
        <img src={logoSrc} height={32} />
      </div>

      {/* Title */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, zIndex: 2 }}>
        <div
          style={{
            fontSize: titleSize,
            fontWeight: 700,
            lineHeight: 1.2,
            color: '#ffffff',
            display: 'flex',
          }}
        >
          {meta.title}
        </div>
        <div
          style={{
            fontSize: 26,
            color: '#7dd3fc',
            lineHeight: 1.4,
            maxHeight: 76,
            overflow: 'hidden',
            display: 'flex',
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '...' : meta.excerpt}
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', gap: 24, fontSize: 22, color: '#00d4ff', zIndex: 2 }}>
        <span style={{ fontWeight: 600 }}>{meta.author}</span>
        <span style={{ color: '#00d4ff50' }}>|</span>
        <span>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
        <span style={{ color: '#00d4ff50' }}>|</span>
        <span>{meta.readingTime} min read</span>
      </div>
    </div>,
    size,
  );
}
