/**
 * V33: Floating Bubbles — various sized circles scattered across the background.
 * Different opacities and colors for a playful, airy feel.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

interface Bubble {
  x: number;
  y: number;
  size: number;
  color: string;
  opacity: number;
  hasBorder: boolean;
}

const BUBBLES: Bubble[] = [
  { x: 60, y: 40, size: 50, color: '#a78bfa', opacity: 0.2, hasBorder: false },
  { x: 180, y: 130, size: 18, color: '#34d399', opacity: 0.35, hasBorder: false },
  { x: 90, y: 280, size: 36, color: '#f472b6', opacity: 0.15, hasBorder: true },
  { x: 300, y: 60, size: 12, color: '#fbbf24', opacity: 0.5, hasBorder: false },
  { x: 420, y: 30, size: 28, color: '#60a5fa', opacity: 0.2, hasBorder: true },
  { x: 550, y: 80, size: 60, color: '#a78bfa', opacity: 0.1, hasBorder: false },
  { x: 700, y: 25, size: 20, color: '#34d399', opacity: 0.4, hasBorder: false },
  { x: 850, y: 60, size: 42, color: '#f472b6', opacity: 0.12, hasBorder: true },
  { x: 1000, y: 40, size: 14, color: '#fbbf24', opacity: 0.45, hasBorder: false },
  { x: 1100, y: 100, size: 80, color: '#60a5fa', opacity: 0.08, hasBorder: false },
  { x: 1140, y: 250, size: 30, color: '#a78bfa', opacity: 0.25, hasBorder: false },
  { x: 50, y: 480, size: 44, color: '#34d399', opacity: 0.15, hasBorder: true },
  { x: 200, y: 550, size: 22, color: '#f472b6', opacity: 0.3, hasBorder: false },
  { x: 380, y: 510, size: 56, color: '#fbbf24', opacity: 0.1, hasBorder: false },
  { x: 520, y: 570, size: 16, color: '#60a5fa', opacity: 0.4, hasBorder: false },
  { x: 680, y: 530, size: 38, color: '#a78bfa', opacity: 0.18, hasBorder: true },
  { x: 820, y: 490, size: 10, color: '#34d399', opacity: 0.5, hasBorder: false },
  { x: 940, y: 560, size: 70, color: '#f472b6', opacity: 0.07, hasBorder: false },
  { x: 1080, y: 500, size: 26, color: '#fbbf24', opacity: 0.22, hasBorder: false },
  { x: 1150, y: 420, size: 48, color: '#60a5fa', opacity: 0.1, hasBorder: true },
  { x: 30, y: 380, size: 8, color: '#a78bfa', opacity: 0.55, hasBorder: false },
  { x: 1060, y: 340, size: 15, color: '#34d399', opacity: 0.35, hasBorder: false },
  { x: 750, y: 470, size: 24, color: '#fbbf24', opacity: 0.28, hasBorder: false },
  { x: 350, y: 420, size: 32, color: '#60a5fa', opacity: 0.14, hasBorder: true },
];

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
        backgroundColor: '#1e1b2e',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Bubbles */}
      {BUBBLES.map((b, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            left: b.x - b.size / 2,
            top: b.y - b.size / 2,
            width: b.size,
            height: b.size,
            borderRadius: 9999,
            backgroundColor: b.hasBorder ? 'transparent' : b.color,
            border: b.hasBorder ? `1.5px solid ${b.color}` : 'none',
            opacity: b.opacity,
          }}
        />
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
          <span style={{ color: '#ddd6fe', fontSize: 22, marginLeft: 12, fontWeight: 600 }}>
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
              color: '#c4b5fd',
              lineHeight: 1.5,
              opacity: 0.75,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ color: '#a78bfa', fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#3b3260', fontSize: 22 }}>\u00b7</span>
          <span style={{ color: '#8b83a8', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#3b3260', fontSize: 22 }}>\u00b7</span>
          <span style={{ color: '#8b83a8', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
