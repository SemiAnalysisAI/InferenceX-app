/**
 * V89: Chevron Pattern — V-shaped chevron elements stacked vertically along the right side, suggesting forward motion. Teal/cyan color.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

interface Chevron {
  x: number;
  y: number;
  armWidth: number;
  armHeight: number;
  opacity: number;
  color: string;
}

// Right-pointing chevrons stacked along the right side
const CHEVRONS: Chevron[] = [
  // Primary column — right side
  { x: 1020, y: 30, armWidth: 40, armHeight: 3, opacity: 0.25, color: '#06b6d4' },
  { x: 1020, y: 80, armWidth: 40, armHeight: 3, opacity: 0.2, color: '#22d3ee' },
  { x: 1020, y: 130, armWidth: 40, armHeight: 3, opacity: 0.3, color: '#06b6d4' },
  { x: 1020, y: 180, armWidth: 40, armHeight: 3, opacity: 0.15, color: '#67e8f9' },
  { x: 1020, y: 230, armWidth: 40, armHeight: 3, opacity: 0.22, color: '#06b6d4' },
  { x: 1020, y: 280, armWidth: 40, armHeight: 3, opacity: 0.18, color: '#22d3ee' },
  { x: 1020, y: 330, armWidth: 40, armHeight: 3, opacity: 0.28, color: '#06b6d4' },
  { x: 1020, y: 380, armWidth: 40, armHeight: 3, opacity: 0.14, color: '#67e8f9' },
  { x: 1020, y: 430, armWidth: 40, armHeight: 3, opacity: 0.24, color: '#22d3ee' },
  { x: 1020, y: 480, armWidth: 40, armHeight: 3, opacity: 0.16, color: '#06b6d4' },
  { x: 1020, y: 530, armWidth: 40, armHeight: 3, opacity: 0.2, color: '#22d3ee' },
  { x: 1020, y: 580, armWidth: 40, armHeight: 3, opacity: 0.12, color: '#67e8f9' },
  // Secondary column — further right, offset
  { x: 1090, y: 55, armWidth: 32, armHeight: 2, opacity: 0.12, color: '#06b6d4' },
  { x: 1090, y: 105, armWidth: 32, armHeight: 2, opacity: 0.1, color: '#22d3ee' },
  { x: 1090, y: 155, armWidth: 32, armHeight: 2, opacity: 0.14, color: '#06b6d4' },
  { x: 1090, y: 205, armWidth: 32, armHeight: 2, opacity: 0.08, color: '#67e8f9' },
  { x: 1090, y: 255, armWidth: 32, armHeight: 2, opacity: 0.12, color: '#06b6d4' },
  { x: 1090, y: 305, armWidth: 32, armHeight: 2, opacity: 0.1, color: '#22d3ee' },
  { x: 1090, y: 355, armWidth: 32, armHeight: 2, opacity: 0.14, color: '#06b6d4' },
  { x: 1090, y: 405, armWidth: 32, armHeight: 2, opacity: 0.08, color: '#67e8f9' },
  { x: 1090, y: 455, armWidth: 32, armHeight: 2, opacity: 0.12, color: '#22d3ee' },
  { x: 1090, y: 505, armWidth: 32, armHeight: 2, opacity: 0.1, color: '#06b6d4' },
  { x: 1090, y: 555, armWidth: 32, armHeight: 2, opacity: 0.14, color: '#22d3ee' },
  // Subtle left-side accents
  { x: 30, y: 100, armWidth: 24, armHeight: 2, opacity: 0.06, color: '#06b6d4' },
  { x: 30, y: 200, armWidth: 24, armHeight: 2, opacity: 0.08, color: '#22d3ee' },
  { x: 30, y: 300, armWidth: 24, armHeight: 2, opacity: 0.05, color: '#06b6d4' },
  { x: 30, y: 400, armWidth: 24, armHeight: 2, opacity: 0.07, color: '#22d3ee' },
  { x: 30, y: 500, armWidth: 24, armHeight: 2, opacity: 0.06, color: '#06b6d4' },
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
        backgroundColor: '#0a1628',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Chevron elements — each is two angled arms forming a > shape */}
      {CHEVRONS.map((ch, i) => (
        <div
          key={`ch-${i}`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            position: 'absolute',
            left: ch.x,
            top: ch.y,
            opacity: ch.opacity,
          }}
        >
          {/* Upper arm — angled down-right */}
          <div
            style={{
              display: 'flex',
              width: ch.armWidth,
              height: ch.armHeight,
              backgroundColor: ch.color,
              transform: 'rotate(30deg)',
              transformOrigin: '0 50%',
            }}
          />
          {/* Lower arm — angled up-right */}
          <div
            style={{
              display: 'flex',
              width: ch.armWidth,
              height: ch.armHeight,
              backgroundColor: ch.color,
              transform: 'rotate(-30deg)',
              transformOrigin: '0 50%',
              marginTop: ch.armWidth * 0.4,
            }}
          />
        </div>
      ))}

      {/* Teal glow — right side */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: -100,
          top: 150,
          width: 350,
          height: 350,
          borderRadius: 9999,
          backgroundColor: '#0e7490',
          opacity: 0.06,
        }}
      />

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
          <span style={{ color: '#67e8f9', fontSize: 22, marginLeft: 12, fontWeight: 600 }}>
            InferenceX
          </span>
        </div>

        {/* Title & excerpt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860 }}>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 800,
              color: '#ecfeff',
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#22d3ee',
              lineHeight: 1.5,
              opacity: 0.75,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ color: '#67e8f9', fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#164e63', fontSize: 22 }}>{'\u00b7'}</span>
          <span style={{ color: '#0e7490', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#164e63', fontSize: 22 }}>{'\u00b7'}</span>
          <span style={{ color: '#0e7490', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
