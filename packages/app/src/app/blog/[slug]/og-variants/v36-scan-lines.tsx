/**
 * V36: Scan Lines — CRT/retro monitor effect with many thin horizontal lines
 * spanning full width, spaced evenly apart. Green-tinted lines on dark bg.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#0a0f0a';
const LINE_COLOR = '#00ff4118';
const LINE_BRIGHT = '#00ff4130';
const ACCENT = '#00ff41';

// Generate scan lines every 10px, with occasional brighter ones
const scanLines = Array.from({ length: 63 }, (_, i) => ({
  top: i * 10,
  color: i % 5 === 0 ? LINE_BRIGHT : LINE_COLOR,
  height: i % 5 === 0 ? 2 : 1,
}));

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
        color: '#e0ffe0',
        padding: 60,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Scan lines */}
      {scanLines.map((line, i) => (
        <div
          key={`sl${i}`}
          style={{
            position: 'absolute',
            left: 0,
            top: line.top,
            width: 1200,
            height: line.height,
            backgroundColor: line.color,
            display: 'flex',
          }}
        />
      ))}

      {/* Phosphor glow bar at top */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1200,
          height: 4,
          backgroundColor: '#00ff4150',
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
            color: '#88cc88',
            lineHeight: 1.4,
            maxHeight: 80,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', gap: 24, fontSize: 22, color: ACCENT, zIndex: 1 }}>
        <span style={{ fontWeight: 600 }}>{meta.author}</span>
        <span style={{ color: '#00ff4160' }}>//</span>
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
