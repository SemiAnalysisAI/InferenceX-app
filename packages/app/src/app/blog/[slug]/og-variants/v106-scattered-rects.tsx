/**
 * V106: Scattered Rects — 15-20 randomly positioned rectangles of varying sizes and colors at low opacity creating an abstract art background.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  const rects = [
    { top: 30, left: 50, w: 80, h: 60, color: 'rgba(0,200,180,0.12)', border: false },
    { top: 100, left: 900, w: 120, h: 40, color: 'rgba(255,180,0,0.10)', border: false },
    { top: 200, left: 150, w: 50, h: 100, color: 'rgba(100,100,255,0.08)', border: true },
    { top: 350, left: 1000, w: 90, h: 90, color: 'rgba(0,200,180,0.15)', border: false },
    { top: 450, left: 60, w: 40, h: 40, color: 'rgba(255,100,100,0.10)', border: false },
    { top: 500, left: 800, w: 110, h: 30, color: 'rgba(0,150,255,0.12)', border: true },
    { top: 80, left: 400, w: 70, h: 70, color: 'rgba(200,50,200,0.08)', border: false },
    { top: 250, left: 700, w: 60, h: 80, color: 'rgba(255,220,0,0.10)', border: true },
    { top: 150, left: 1050, w: 100, h: 50, color: 'rgba(0,200,180,0.10)', border: false },
    { top: 400, left: 300, w: 30, h: 120, color: 'rgba(100,200,100,0.12)', border: false },
    { top: 520, left: 500, w: 80, h: 25, color: 'rgba(0,100,255,0.08)', border: true },
    { top: 60, left: 700, w: 45, h: 45, color: 'rgba(255,150,50,0.15)', border: false },
    { top: 300, left: 450, w: 100, h: 60, color: 'rgba(50,50,200,0.10)', border: true },
    { top: 550, left: 200, w: 55, h: 55, color: 'rgba(0,200,180,0.08)', border: false },
    { top: 180, left: 550, w: 35, h: 90, color: 'rgba(200,200,0,0.12)', border: false },
    { top: 420, left: 650, w: 75, h: 35, color: 'rgba(255,80,80,0.10)', border: true },
    { top: 10, left: 250, w: 20, h: 20, color: 'rgba(0,200,180,0.18)', border: false },
    { top: 480, left: 1100, w: 60, h: 60, color: 'rgba(100,50,200,0.10)', border: false },
  ];

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '1200px',
        height: '630px',
        backgroundColor: '#0a0e17',
        position: 'relative',
      }}
    >
      {/* Scattered rectangles */}
      {rects.map((r, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            top: r.top,
            left: r.left,
            width: r.w,
            height: r.h,
            backgroundColor: r.border ? 'transparent' : r.color,
            border: r.border ? `2px solid ${r.color}` : 'none',
          }}
        />
      ))}

      {/* Content overlay */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: '60px',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} width={48} height={48} />
          <span
            style={{
              display: 'flex',
              fontSize: 24,
              color: '#ffffff',
              marginLeft: 16,
              fontWeight: 600,
            }}
          >
            InferenceX
          </span>
        </div>

        {/* Title and excerpt */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 1.2,
              marginBottom: 20,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: 'rgba(255,255,255,0.6)',
              lineHeight: 1.4,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', fontSize: 18, color: 'rgba(255,255,255,0.5)' }}>
            {meta.author}
          </div>
          <div style={{ display: 'flex', fontSize: 18, color: 'rgba(255,255,255,0.5)' }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
