/**
 * V112: Spiral Dots — Dots arranged in a rough spiral pattern emanating from center-right, getting smaller outward, creating a galaxy/vortex feel.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  // Generate spiral dots from center-right
  const cx = 900;
  const cy = 315;
  const dots: { top: number; left: number; s: number; opacity: number; blue: boolean }[] = [];

  for (let i = 0; i < 55; i++) {
    const angle = i * 0.45;
    const radius = 20 + i * 5.5;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    const dotSize = Math.max(3, 12 - i * 0.18);
    const opacity = Math.max(0.1, 0.7 - i * 0.01);

    if (x >= 0 && x <= 1200 && y >= 0 && y <= 630) {
      dots.push({
        top: Math.round(y),
        left: Math.round(x),
        s: Math.round(dotSize),
        opacity,
        blue: i % 3 !== 0,
      });
    }
  }

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '1200px',
        height: '630px',
        backgroundColor: '#0a0e1a',
        position: 'relative',
      }}
    >
      {/* Spiral dots */}
      {dots.map((d, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            top: d.top - Math.floor(d.s / 2),
            left: d.left - Math.floor(d.s / 2),
            width: d.s,
            height: d.s,
            borderRadius: 9999,
            backgroundColor: d.blue
              ? `rgba(100,180,255,${d.opacity})`
              : `rgba(255,255,255,${d.opacity})`,
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
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 800 }}>
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
