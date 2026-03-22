/**
 * V65: Staircase Blocks — Asymmetric overlapping rectangles stepping down from top-right
 * to bottom-left, each a different shade. Content flows over them with zIndex.
 * Creates dynamic layered depth.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const steps = [
  { left: 700, top: -30, width: 560, height: 220, color: '#14181e' },
  { left: 540, top: 120, width: 480, height: 200, color: '#161c22' },
  { left: 360, top: 240, width: 520, height: 190, color: '#181e24' },
  { left: 160, top: 350, width: 500, height: 180, color: '#1a2028' },
  { left: 0, top: 460, width: 560, height: 200, color: '#1c222c' },
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
        position: 'relative',
        overflow: 'hidden',
        padding: 56,
      }}
    >
      {/* Staircase blocks */}
      {steps.map((step, i) => (
        <div
          key={`s${i}`}
          style={{
            position: 'absolute',
            left: step.left,
            top: step.top,
            width: step.width,
            height: step.height,
            backgroundColor: step.color,
            borderRadius: 8,
            border: '1px solid #ffffff08',
            display: 'flex',
          }}
        />
      ))}

      {/* Gold accent on middle step edge */}
      <div
        style={{
          position: 'absolute',
          left: 360,
          top: 240,
          width: 3,
          height: 190,
          backgroundColor: '#F7B04130',
          display: 'flex',
        }}
      />

      {/* Teal accent on second step */}
      <div
        style={{
          position: 'absolute',
          left: 540,
          top: 120,
          width: 480,
          height: 1,
          backgroundColor: '#2dd4bf18',
          display: 'flex',
        }}
      />

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', zIndex: 2 }}>
        <img src={logoSrc} height={32} />
      </div>

      {/* Title + excerpt */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, zIndex: 2 }}>
        <div
          style={{
            display: 'flex',
            fontSize: titleSize,
            fontWeight: 700,
            lineHeight: 1.2,
            color: '#ffffff',
          }}
        >
          {meta.title}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 26,
            color: '#a1a1aa',
            lineHeight: 1.4,
            maxHeight: 76,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          fontSize: 22,
          color: '#9090a0',
          zIndex: 2,
        }}
      >
        <span style={{ fontWeight: 600, color: '#d0d0d8' }}>{meta.author}</span>
        <span>{'\u00b7'}</span>
        <span>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
        <span>{'\u00b7'}</span>
        <span>{meta.readingTime} min read</span>
      </div>
    </div>,
    size,
  );
}
