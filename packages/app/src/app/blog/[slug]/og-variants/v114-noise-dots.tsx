/**
 * V114: Noise Dots — Many tiny dots randomly positioned across the background like film grain, a mix of white and gold dots at 10-20% opacity.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  const noiseDots = [
    { top: 12, left: 45, s: 4, gold: false, o: 0.12 },
    { top: 28, left: 180, s: 3, gold: true, o: 0.15 },
    { top: 8, left: 340, s: 5, gold: false, o: 0.1 },
    { top: 35, left: 500, s: 3, gold: true, o: 0.18 },
    { top: 15, left: 650, s: 4, gold: false, o: 0.14 },
    { top: 40, left: 810, s: 6, gold: true, o: 0.11 },
    { top: 22, left: 960, s: 3, gold: false, o: 0.16 },
    { top: 5, left: 1100, s: 5, gold: true, o: 0.13 },
    { top: 70, left: 90, s: 4, gold: true, o: 0.17 },
    { top: 85, left: 260, s: 3, gold: false, o: 0.12 },
    { top: 65, left: 420, s: 5, gold: true, o: 0.19 },
    { top: 95, left: 580, s: 4, gold: false, o: 0.1 },
    { top: 78, left: 730, s: 3, gold: true, o: 0.15 },
    { top: 60, left: 890, s: 6, gold: false, o: 0.13 },
    { top: 88, left: 1040, s: 4, gold: true, o: 0.11 },
    { top: 130, left: 30, s: 3, gold: false, o: 0.18 },
    { top: 145, left: 200, s: 5, gold: true, o: 0.14 },
    { top: 120, left: 370, s: 4, gold: false, o: 0.16 },
    { top: 155, left: 530, s: 3, gold: true, o: 0.12 },
    { top: 135, left: 690, s: 5, gold: false, o: 0.2 },
    { top: 160, left: 850, s: 4, gold: true, o: 0.1 },
    { top: 125, left: 1010, s: 3, gold: false, o: 0.17 },
    { top: 150, left: 1150, s: 5, gold: true, o: 0.13 },
    { top: 200, left: 110, s: 4, gold: false, o: 0.15 },
    { top: 215, left: 290, s: 3, gold: true, o: 0.11 },
    { top: 195, left: 450, s: 6, gold: false, o: 0.19 },
    { top: 225, left: 610, s: 4, gold: true, o: 0.14 },
    { top: 210, left: 770, s: 3, gold: false, o: 0.16 },
    { top: 190, left: 930, s: 5, gold: true, o: 0.12 },
    { top: 230, left: 1080, s: 4, gold: false, o: 0.18 },
    { top: 280, left: 60, s: 3, gold: true, o: 0.1 },
    { top: 295, left: 230, s: 5, gold: false, o: 0.15 },
    { top: 270, left: 400, s: 4, gold: true, o: 0.2 },
    { top: 305, left: 560, s: 3, gold: false, o: 0.13 },
    { top: 285, left: 720, s: 6, gold: true, o: 0.11 },
    { top: 310, left: 880, s: 4, gold: false, o: 0.17 },
    { top: 275, left: 1040, s: 3, gold: true, o: 0.14 },
    { top: 360, left: 140, s: 5, gold: false, o: 0.12 },
    { top: 375, left: 320, s: 4, gold: true, o: 0.19 },
    { top: 350, left: 480, s: 3, gold: false, o: 0.16 },
    { top: 385, left: 640, s: 5, gold: true, o: 0.1 },
    { top: 365, left: 800, s: 4, gold: false, o: 0.15 },
    { top: 390, left: 950, s: 3, gold: true, o: 0.18 },
    { top: 355, left: 1120, s: 6, gold: false, o: 0.13 },
    { top: 440, left: 50, s: 4, gold: true, o: 0.11 },
    { top: 455, left: 210, s: 3, gold: false, o: 0.2 },
    { top: 430, left: 380, s: 5, gold: true, o: 0.14 },
    { top: 465, left: 540, s: 4, gold: false, o: 0.12 },
    { top: 445, left: 700, s: 3, gold: true, o: 0.17 },
    { top: 470, left: 860, s: 5, gold: false, o: 0.1 },
    { top: 435, left: 1020, s: 4, gold: true, o: 0.16 },
    { top: 520, left: 130, s: 3, gold: false, o: 0.19 },
    { top: 535, left: 300, s: 5, gold: true, o: 0.13 },
    { top: 510, left: 460, s: 4, gold: false, o: 0.15 },
    { top: 545, left: 620, s: 3, gold: true, o: 0.11 },
    { top: 525, left: 780, s: 6, gold: false, o: 0.18 },
    { top: 550, left: 940, s: 4, gold: true, o: 0.14 },
    { top: 515, left: 1100, s: 3, gold: false, o: 0.12 },
    { top: 590, left: 80, s: 5, gold: true, o: 0.16 },
    { top: 605, left: 250, s: 4, gold: false, o: 0.1 },
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
      {/* Noise dots */}
      {noiseDots.map((d, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            top: d.top,
            left: d.left,
            width: d.s,
            height: d.s,
            borderRadius: 9999,
            backgroundColor: d.gold ? `rgba(255,200,50,${d.o})` : `rgba(255,255,255,${d.o})`,
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
