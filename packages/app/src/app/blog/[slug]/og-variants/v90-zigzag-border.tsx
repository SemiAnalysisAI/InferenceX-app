/**
 * V90: Zigzag Border — top and bottom edges with zigzag/sawtooth pattern made of triangular elements. Gold zigzag on dark background.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

// Generate zigzag teeth for top and bottom edges
const TOOTH_WIDTH = 40;
const TOOTH_HEIGHT = 28;
const NUM_TEETH = Math.ceil(1200 / TOOTH_WIDTH) + 1;

interface Tooth {
  x: number;
  edge: 'top' | 'bottom';
}

const TEETH: Tooth[] = [];
for (let i = 0; i < NUM_TEETH; i++) {
  TEETH.push({ x: i * TOOTH_WIDTH, edge: 'top' });
  TEETH.push({ x: i * TOOTH_WIDTH, edge: 'bottom' });
}

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
        backgroundColor: '#141414',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top zigzag strip background */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1200,
          height: TOOTH_HEIGHT,
          backgroundColor: '#b45309',
          opacity: 0.15,
        }}
      />

      {/* Top zigzag — downward-pointing triangles along the bottom of the gold strip */}
      {Array.from({ length: NUM_TEETH }).map((_, i) => (
        <div
          key={`top-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: i * TOOTH_WIDTH,
            top: TOOTH_HEIGHT,
            width: 0,
            height: 0,
            borderLeft: `${TOOTH_WIDTH / 2}px solid transparent`,
            borderRight: `${TOOTH_WIDTH / 2}px solid transparent`,
            borderTop: `${TOOTH_HEIGHT}px solid #d97706`,
            opacity: 0.2,
          }}
        />
      ))}

      {/* Top zigzag line accent */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 0,
          top: TOOTH_HEIGHT - 1,
          width: 1200,
          height: 2,
          backgroundColor: '#fbbf24',
          opacity: 0.3,
        }}
      />

      {/* Bottom zigzag strip background */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: 1200,
          height: TOOTH_HEIGHT,
          backgroundColor: '#b45309',
          opacity: 0.15,
        }}
      />

      {/* Bottom zigzag — upward-pointing triangles along the top of the gold strip */}
      {Array.from({ length: NUM_TEETH }).map((_, i) => (
        <div
          key={`bot-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: i * TOOTH_WIDTH,
            bottom: TOOTH_HEIGHT,
            width: 0,
            height: 0,
            borderLeft: `${TOOTH_WIDTH / 2}px solid transparent`,
            borderRight: `${TOOTH_WIDTH / 2}px solid transparent`,
            borderBottom: `${TOOTH_HEIGHT}px solid #d97706`,
            opacity: 0.2,
          }}
        />
      ))}

      {/* Bottom zigzag line accent */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 0,
          bottom: TOOTH_HEIGHT - 1,
          width: 1200,
          height: 2,
          backgroundColor: '#fbbf24',
          opacity: 0.3,
        }}
      />

      {/* Subtle gold dust accents */}
      {[
        { x: 100, y: 80, s: 4 },
        { x: 300, y: 120, s: 3 },
        { x: 600, y: 70, s: 5 },
        { x: 900, y: 100, s: 3 },
        { x: 1100, y: 85, s: 4 },
        { x: 150, y: 540, s: 3 },
        { x: 450, y: 560, s: 4 },
        { x: 750, y: 530, s: 3 },
        { x: 1050, y: 555, s: 5 },
      ].map((dot, i) => (
        <div
          key={`dot-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: dot.x,
            top: dot.y,
            width: dot.s,
            height: dot.s,
            borderRadius: 9999,
            backgroundColor: '#fbbf24',
            opacity: 0.15,
          }}
        />
      ))}

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 56px 72px 56px',
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
              color: '#fef9c3',
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
              opacity: 0.75,
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
