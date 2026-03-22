/**
 * V9: Scattered Nodes — Sparse, randomly-placed circuit nodes and traces.
 * More organic/constellation feel. Nodes connected by faint trace lines.
 * Closest to the actual OG image's scattered block aesthetic.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const nodes = [
  { x: 50, y: 40, s: 16, color: '#2dd4bf40' },
  { x: 180, y: 120, s: 10, color: '#2dd4bf30' },
  { x: 350, y: 60, s: 14, color: '#eab30850' },
  { x: 500, y: 30, s: 8, color: '#2dd4bf25' },
  { x: 750, y: 50, s: 12, color: '#2dd4bf35' },
  { x: 920, y: 80, s: 18, color: '#eab30840' },
  { x: 1080, y: 40, s: 10, color: '#2dd4bf30' },
  { x: 1150, y: 120, s: 14, color: '#2dd4bf25' },
  { x: 30, y: 300, s: 12, color: '#2dd4bf20' },
  { x: 100, y: 450, s: 16, color: '#eab30835' },
  { x: 280, y: 550, s: 10, color: '#2dd4bf30' },
  { x: 800, y: 500, s: 14, color: '#2dd4bf25' },
  { x: 950, y: 560, s: 20, color: '#eab30845' },
  { x: 1100, y: 480, s: 12, color: '#2dd4bf35' },
  { x: 1160, y: 580, s: 8, color: '#2dd4bf20' },
  { x: 600, y: 580, s: 10, color: '#2dd4bf20' },
  { x: 1050, y: 300, s: 10, color: '#2dd4bf18' },
  { x: 1140, y: 350, s: 14, color: '#2dd4bf22' },
];

const traces = [
  { x: 50, y: 48, w: 130, h: 1 },
  { x: 180, y: 125, w: 170, h: 1 },
  { x: 920, y: 89, w: 160, h: 1 },
  { x: 100, y: 458, w: 180, h: 1 },
  { x: 950, y: 570, w: 150, h: 1 },
  { x: 56, y: 48, w: 1, h: 252 },
  { x: 1086, y: 48, w: 1, h: 232 },
  { x: 956, y: 89, w: 1, h: 471 },
];

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 56 : meta.title.length > 40 ? 64 : 72;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        backgroundColor: '#0c0c0e',
        color: '#fafafa',
        padding: 60,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Nodes */}
      {nodes.map((n, i) => (
        <div
          key={`n${i}`}
          style={{
            position: 'absolute',
            left: n.x,
            top: n.y,
            width: n.s,
            height: n.s,
            border: `2px solid ${n.color}`,
            borderRadius: 3,
            display: 'flex',
          }}
        />
      ))}

      {/* Trace lines */}
      {traces.map((t, i) => (
        <div
          key={`t${i}`}
          style={{
            position: 'absolute',
            left: t.x,
            top: t.y,
            width: t.w,
            height: t.h,
            backgroundColor: '#2dd4bf10',
            display: 'flex',
          }}
        />
      ))}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', zIndex: 1 }}>
        <img src={logoSrc} height={96} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, zIndex: 1 }}>
        <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.2 }}>{meta.title}</div>
        <div
          style={{
            fontSize: 42,
            color: '#d4d4d8',
            lineHeight: 1.4,
            maxHeight: 60,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 100 ? meta.excerpt.slice(0, 100) + '...' : meta.excerpt}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, fontSize: 36, color: '#d4d4d8', zIndex: 1 }}>
        <span>{meta.author}</span>
        <span>·</span>
        <span>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
        <span>·</span>
        <span>{meta.readingTime} min read</span>
      </div>
    </div>,
    size,
  );
}
