/**
 * V5: Diagonal Blocks — Circuit blocks arranged diagonally from top-left to bottom-right.
 * Creates a dynamic flow that leads the eye across the card.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const blocks = [
  { x: -20, y: -20, w: 100, h: 100, color: '#2dd4bf25' },
  { x: 80, y: 40, w: 70, h: 70, color: '#2dd4bf18' },
  { x: 180, y: 100, w: 90, h: 60, color: '#eab30830' },
  { x: 300, y: 140, w: 60, h: 80, color: '#2dd4bf15' },
  { x: 420, y: 200, w: 80, h: 50, color: '#2dd4bf20' },
  { x: 540, y: 240, w: 50, h: 70, color: '#eab30820' },
  { x: 680, y: 300, w: 70, h: 60, color: '#2dd4bf18' },
  { x: 800, y: 350, w: 90, h: 80, color: '#2dd4bf25' },
  { x: 930, y: 410, w: 60, h: 60, color: '#eab30830' },
  { x: 1050, y: 460, w: 80, h: 80, color: '#2dd4bf20' },
  { x: 1140, y: 530, w: 70, h: 100, color: '#2dd4bf15' },
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
        backgroundColor: '#0c0c0e',
        color: '#fafafa',
        padding: 60,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {blocks.map((b, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: b.x,
            top: b.y,
            width: b.w,
            height: b.h,
            border: `2px solid ${b.color}`,
            borderRadius: 4,
            display: 'flex',
          }}
        />
      ))}

      {/* Diagonal trace line */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1700,
          height: 2,
          backgroundColor: '#2dd4bf10',
          transform: 'rotate(28deg)',
          transformOrigin: '0 0',
          display: 'flex',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 40,
          top: 0,
          width: 1700,
          height: 1,
          backgroundColor: '#eab30810',
          transform: 'rotate(28deg)',
          transformOrigin: '0 0',
          display: 'flex',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', zIndex: 1 }}>
        <img src={logoSrc} height={32} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, zIndex: 1 }}>
        <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.2 }}>{meta.title}</div>
        <div
          style={{
            fontSize: 28,
            color: '#a1a1aa',
            lineHeight: 1.4,
            maxHeight: 80,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '...' : meta.excerpt}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, fontSize: 24, color: '#a1a1aa', zIndex: 1 }}>
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
