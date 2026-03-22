/**
 * V84: Progress Bar — Futuristic HUD with a loading/progress bar, tech-style
 * title display, reading time as percentage, and status indicators.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

// HUD corner brackets
const corners = [
  // Top-left
  { x: 30, y: 30, w: 40, h: 2, display: 'flex' as const },
  { x: 30, y: 30, w: 2, h: 40, display: 'flex' as const },
  // Top-right
  { x: 1130, y: 30, w: 40, h: 2, display: 'flex' as const },
  { x: 1168, y: 30, w: 2, h: 40, display: 'flex' as const },
  // Bottom-left
  { x: 30, y: 598, w: 40, h: 2, display: 'flex' as const },
  { x: 30, y: 560, w: 2, h: 40, display: 'flex' as const },
  // Bottom-right
  { x: 1130, y: 598, w: 40, h: 2, display: 'flex' as const },
  { x: 1168, y: 560, w: 2, h: 40, display: 'flex' as const },
];

// Decorative tick marks along the progress bar
const ticks = Array.from({ length: 20 }, (_, i) => ({
  x: 80 + i * 52,
  y: 470,
  h: i % 5 === 0 ? 12 : 6,
}));

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;
  const progressPercent = Math.min(100, Math.max(10, 100 - meta.readingTime * 5));
  const barWidth = Math.round(1040 * (progressPercent / 100));

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        backgroundColor: '#0a0e14',
        color: '#ffffff',
        padding: '60px 80px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* HUD corner brackets */}
      {corners.map((c, i) => (
        <div
          key={`c${i}`}
          style={{
            position: 'absolute',
            left: c.x,
            top: c.y,
            width: c.w,
            height: c.h,
            backgroundColor: '#00d4ff30',
            display: c.display,
          }}
        />
      ))}

      {/* Top scan line */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1200,
          height: 1,
          backgroundColor: '#00d4ff10',
          display: 'flex',
        }}
      />

      {/* Logo + status */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 2,
        }}
      >
        <img src={logoSrc} height={28} />
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 9999,
              backgroundColor: '#00d4ff',
              display: 'flex',
            }}
          />
          <span style={{ fontSize: 14, color: '#00d4ff80', letterSpacing: 2 }}>SYSTEM ACTIVE</span>
        </div>
      </div>

      {/* Loading title */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, zIndex: 2 }}>
        <div style={{ display: 'flex', fontSize: 16, color: '#00d4ff60', letterSpacing: 2 }}>
          LOADING CONTENT...
        </div>
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
            fontSize: 24,
            color: '#64748b',
            lineHeight: 1.4,
            maxHeight: 70,
            overflow: 'hidden',
            display: 'flex',
          }}
        >
          {meta.excerpt.length > 130 ? meta.excerpt.slice(0, 130) + '...' : meta.excerpt}
        </div>
      </div>

      {/* Progress section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, zIndex: 2 }}>
        {/* Tick marks */}
        <div style={{ display: 'flex', position: 'relative', height: 12 }}>
          {ticks.map((t, i) => (
            <div
              key={`tk${i}`}
              style={{
                position: 'absolute',
                left: t.x - 80,
                bottom: 0,
                width: 1,
                height: t.h,
                backgroundColor: '#ffffff15',
                display: 'flex',
              }}
            />
          ))}
        </div>

        {/* Progress bar track */}
        <div
          style={{
            display: 'flex',
            width: 1040,
            height: 8,
            backgroundColor: '#1e293b',
            borderRadius: 4,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Filled portion */}
          <div
            style={{
              display: 'flex',
              width: barWidth,
              height: 8,
              backgroundColor: '#eab308',
              borderRadius: 4,
            }}
          />
        </div>

        {/* Labels under progress bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16 }}>
          <div style={{ display: 'flex', gap: 20 }}>
            <span style={{ color: '#64748b' }}>{meta.author}</span>
            <span style={{ color: '#334155' }}>|</span>
            <span style={{ color: '#64748b' }}>
              {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC',
              })}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ color: '#eab308', fontWeight: 600 }}>{progressPercent}%</span>
            <span style={{ color: '#64748b' }}>{meta.readingTime} min read</span>
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
