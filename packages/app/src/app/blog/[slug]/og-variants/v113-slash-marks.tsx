/**
 * V113: Slash Marks — Multiple "/" characters scattered across the background like rain or hash marks at low opacity creating subtle texture.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  const slashes = [
    { top: 15, left: 80, size: 28, opacity: 0.08 },
    { top: 45, left: 320, size: 22, opacity: 0.06 },
    { top: 30, left: 550, size: 32, opacity: 0.1 },
    { top: 20, left: 780, size: 24, opacity: 0.07 },
    { top: 50, left: 1000, size: 26, opacity: 0.09 },
    { top: 90, left: 180, size: 20, opacity: 0.05 },
    { top: 110, left: 450, size: 30, opacity: 0.08 },
    { top: 85, left: 700, size: 24, opacity: 0.06 },
    { top: 100, left: 920, size: 28, opacity: 0.1 },
    { top: 130, left: 1100, size: 22, opacity: 0.07 },
    { top: 170, left: 60, size: 26, opacity: 0.09 },
    { top: 160, left: 280, size: 32, opacity: 0.06 },
    { top: 180, left: 520, size: 20, opacity: 0.08 },
    { top: 155, left: 750, size: 28, opacity: 0.05 },
    { top: 190, left: 980, size: 24, opacity: 0.1 },
    { top: 230, left: 150, size: 22, opacity: 0.07 },
    { top: 250, left: 400, size: 30, opacity: 0.06 },
    { top: 240, left: 640, size: 26, opacity: 0.09 },
    { top: 260, left: 860, size: 20, opacity: 0.08 },
    { top: 220, left: 1050, size: 28, opacity: 0.05 },
    { top: 310, left: 100, size: 24, opacity: 0.1 },
    { top: 300, left: 350, size: 32, opacity: 0.06 },
    { top: 330, left: 580, size: 22, opacity: 0.08 },
    { top: 320, left: 810, size: 26, opacity: 0.07 },
    { top: 340, left: 1020, size: 28, opacity: 0.09 },
    { top: 380, left: 200, size: 20, opacity: 0.05 },
    { top: 400, left: 470, size: 30, opacity: 0.1 },
    { top: 390, left: 700, size: 24, opacity: 0.06 },
    { top: 410, left: 930, size: 26, opacity: 0.08 },
    { top: 370, left: 1130, size: 22, opacity: 0.07 },
    { top: 460, left: 70, size: 28, opacity: 0.09 },
    { top: 450, left: 310, size: 32, opacity: 0.05 },
    { top: 470, left: 540, size: 20, opacity: 0.08 },
    { top: 440, left: 780, size: 26, opacity: 0.1 },
    { top: 480, left: 1000, size: 24, opacity: 0.06 },
    { top: 520, left: 160, size: 22, opacity: 0.07 },
    { top: 540, left: 420, size: 28, opacity: 0.09 },
    { top: 530, left: 660, size: 30, opacity: 0.05 },
    { top: 550, left: 880, size: 24, opacity: 0.08 },
    { top: 510, left: 1080, size: 26, opacity: 0.1 },
    { top: 580, left: 240, size: 20, opacity: 0.06 },
    { top: 600, left: 500, size: 28, opacity: 0.07 },
    { top: 590, left: 740, size: 22, opacity: 0.09 },
    { top: 610, left: 960, size: 26, opacity: 0.05 },
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
      {/* Slash marks */}
      {slashes.map((s, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            top: s.top,
            left: s.left,
            fontSize: s.size,
            color: `rgba(255,255,255,${s.opacity})`,
            fontWeight: 300,
          }}
        >
          /
        </div>
      ))}

      {/* Content overlay */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: '50px 60px',
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
              marginBottom: 18,
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
