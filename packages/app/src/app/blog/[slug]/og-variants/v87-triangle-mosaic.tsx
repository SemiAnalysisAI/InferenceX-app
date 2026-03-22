/**
 * V87: Triangle Mosaic — scattered triangular shapes at low opacity creating a kaleidoscope mosaic feel.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

interface Triangle {
  x: number;
  y: number;
  borderWidth: number;
  color: string;
  opacity: number;
  direction: 'up' | 'down' | 'left' | 'right';
}

const TRIANGLES: Triangle[] = [
  // Scattered across background — CSS triangle trick using borders
  { x: 30, y: 25, borderWidth: 22, color: '#ef4444', opacity: 0.1, direction: 'up' },
  { x: 140, y: 80, borderWidth: 18, color: '#3b82f6', opacity: 0.08, direction: 'down' },
  { x: 260, y: 40, borderWidth: 26, color: '#10b981', opacity: 0.12, direction: 'up' },
  { x: 380, y: 100, borderWidth: 15, color: '#f59e0b', opacity: 0.09, direction: 'right' },
  { x: 500, y: 30, borderWidth: 20, color: '#8b5cf6', opacity: 0.11, direction: 'down' },
  { x: 620, y: 70, borderWidth: 24, color: '#ec4899', opacity: 0.07, direction: 'up' },
  { x: 740, y: 45, borderWidth: 17, color: '#06b6d4', opacity: 0.13, direction: 'left' },
  { x: 860, y: 90, borderWidth: 21, color: '#f97316', opacity: 0.08, direction: 'up' },
  { x: 980, y: 35, borderWidth: 19, color: '#14b8a6', opacity: 0.1, direction: 'down' },
  { x: 1100, y: 75, borderWidth: 23, color: '#a855f7', opacity: 0.12, direction: 'up' },
  { x: 70, y: 180, borderWidth: 16, color: '#6366f1', opacity: 0.09, direction: 'right' },
  { x: 200, y: 150, borderWidth: 25, color: '#f43f5e', opacity: 0.06, direction: 'down' },
  { x: 1050, y: 200, borderWidth: 20, color: '#22c55e', opacity: 0.1, direction: 'up' },
  { x: 1150, y: 160, borderWidth: 14, color: '#eab308', opacity: 0.11, direction: 'left' },
  { x: 50, y: 420, borderWidth: 22, color: '#3b82f6', opacity: 0.08, direction: 'up' },
  { x: 170, y: 480, borderWidth: 19, color: '#ef4444', opacity: 0.12, direction: 'down' },
  { x: 300, y: 530, borderWidth: 24, color: '#8b5cf6', opacity: 0.07, direction: 'right' },
  { x: 440, y: 490, borderWidth: 16, color: '#10b981', opacity: 0.1, direction: 'up' },
  { x: 560, y: 550, borderWidth: 21, color: '#f59e0b', opacity: 0.09, direction: 'down' },
  { x: 680, y: 500, borderWidth: 18, color: '#ec4899', opacity: 0.13, direction: 'left' },
  { x: 800, y: 540, borderWidth: 23, color: '#06b6d4', opacity: 0.06, direction: 'up' },
  { x: 920, y: 480, borderWidth: 15, color: '#f97316', opacity: 0.11, direction: 'down' },
  { x: 1040, y: 530, borderWidth: 20, color: '#14b8a6', opacity: 0.08, direction: 'right' },
  { x: 1140, y: 470, borderWidth: 17, color: '#a855f7', opacity: 0.1, direction: 'up' },
  { x: 100, y: 340, borderWidth: 13, color: '#22c55e', opacity: 0.07, direction: 'down' },
  { x: 1100, y: 350, borderWidth: 19, color: '#6366f1', opacity: 0.09, direction: 'up' },
];

function getTriangleStyle(t: Triangle): Record<string, string | number> {
  const base: Record<string, string | number> = {
    display: 'flex',
    position: 'absolute',
    left: t.x,
    top: t.y,
    width: 0,
    height: 0,
    opacity: t.opacity,
  };
  const b = t.borderWidth;
  const transparent = 'transparent';
  if (t.direction === 'up') {
    base.borderLeft = `${b}px solid ${transparent}`;
    base.borderRight = `${b}px solid ${transparent}`;
    base.borderBottom = `${b * 1.7}px solid ${t.color}`;
  } else if (t.direction === 'down') {
    base.borderLeft = `${b}px solid ${transparent}`;
    base.borderRight = `${b}px solid ${transparent}`;
    base.borderTop = `${b * 1.7}px solid ${t.color}`;
  } else if (t.direction === 'left') {
    base.borderTop = `${b}px solid ${transparent}`;
    base.borderBottom = `${b}px solid ${transparent}`;
    base.borderRight = `${b * 1.7}px solid ${t.color}`;
  } else {
    base.borderTop = `${b}px solid ${transparent}`;
    base.borderBottom = `${b}px solid ${transparent}`;
    base.borderLeft = `${b * 1.7}px solid ${t.color}`;
  }
  return base;
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
        backgroundColor: '#0f0f1a',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Triangle mosaic elements */}
      {TRIANGLES.map((tri, i) => (
        <div key={`tri-${i}`} style={getTriangleStyle(tri)} />
      ))}

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
          <span style={{ color: '#c4b5fd', fontSize: 22, marginLeft: 12, fontWeight: 600 }}>
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
              color: '#f5f3ff',
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#a78bfa',
              lineHeight: 1.5,
              opacity: 0.8,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ color: '#c4b5fd', fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#2e1065', fontSize: 22 }}>{'\u00b7'}</span>
          <span style={{ color: '#7c3aed', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#2e1065', fontSize: 22 }}>{'\u00b7'}</span>
          <span style={{ color: '#7c3aed', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
