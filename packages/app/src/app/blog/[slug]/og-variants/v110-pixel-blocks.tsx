/**
 * V110: Pixel Blocks — Scattered small squares in a few colors creating a pixel-art dissolve effect along one edge with a retro gaming aesthetic.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  const colors = [
    'rgba(0,220,180,0.7)',
    'rgba(0,160,255,0.6)',
    'rgba(255,100,200,0.5)',
    'rgba(255,200,0,0.6)',
    'rgba(100,255,150,0.5)',
  ];

  // Dense pixels on right edge, becoming sparse toward center
  const pixels = [
    // Dense cluster - right edge
    { top: 20, left: 1180, s: 12, c: 0 },
    { top: 40, left: 1168, s: 10, c: 1 },
    { top: 20, left: 1155, s: 14, c: 2 },
    { top: 60, left: 1175, s: 10, c: 0 },
    { top: 55, left: 1150, s: 12, c: 3 },
    { top: 80, left: 1185, s: 8, c: 1 },
    { top: 100, left: 1170, s: 14, c: 4 },
    { top: 90, left: 1145, s: 10, c: 0 },
    { top: 120, left: 1180, s: 12, c: 2 },
    { top: 140, left: 1160, s: 8, c: 1 },
    { top: 135, left: 1140, s: 16, c: 3 },
    { top: 160, left: 1175, s: 10, c: 0 },
    { top: 180, left: 1150, s: 14, c: 4 },
    { top: 200, left: 1185, s: 8, c: 2 },
    { top: 210, left: 1160, s: 12, c: 1 },
    { top: 230, left: 1170, s: 10, c: 0 },
    { top: 250, left: 1145, s: 14, c: 3 },
    { top: 270, left: 1180, s: 8, c: 2 },
    { top: 290, left: 1155, s: 12, c: 4 },
    { top: 310, left: 1175, s: 10, c: 1 },
    { top: 330, left: 1140, s: 16, c: 0 },
    { top: 350, left: 1165, s: 8, c: 3 },
    { top: 370, left: 1185, s: 12, c: 2 },
    { top: 390, left: 1150, s: 10, c: 4 },
    { top: 410, left: 1175, s: 14, c: 1 },
    { top: 430, left: 1160, s: 8, c: 0 },
    { top: 450, left: 1180, s: 12, c: 3 },
    { top: 470, left: 1145, s: 10, c: 2 },
    { top: 490, left: 1170, s: 14, c: 4 },
    { top: 510, left: 1185, s: 8, c: 1 },
    { top: 530, left: 1155, s: 12, c: 0 },
    { top: 550, left: 1175, s: 10, c: 3 },
    { top: 570, left: 1140, s: 16, c: 2 },
    { top: 590, left: 1165, s: 8, c: 4 },
    { top: 610, left: 1185, s: 12, c: 1 },
    // Medium density - mid-right
    { top: 50, left: 1110, s: 10, c: 0 },
    { top: 130, left: 1100, s: 12, c: 2 },
    { top: 220, left: 1115, s: 8, c: 1 },
    { top: 300, left: 1105, s: 14, c: 3 },
    { top: 380, left: 1120, s: 10, c: 4 },
    { top: 460, left: 1095, s: 12, c: 0 },
    { top: 540, left: 1110, s: 8, c: 2 },
    // Sparse - further left
    { top: 80, left: 1060, s: 8, c: 1 },
    { top: 200, left: 1050, s: 10, c: 3 },
    { top: 340, left: 1070, s: 8, c: 0 },
    { top: 480, left: 1055, s: 10, c: 4 },
    // Very sparse - scattered
    { top: 150, left: 1000, s: 8, c: 2 },
    { top: 400, left: 1010, s: 8, c: 1 },
    { top: 560, left: 990, s: 8, c: 3 },
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
      {/* Pixel blocks */}
      {pixels.map((p, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            top: p.top,
            left: p.left,
            width: p.s,
            height: p.s,
            backgroundColor: colors[p.c],
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
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 900 }}>
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
