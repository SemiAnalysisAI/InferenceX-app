/**
 * V108: Waveform Edge — Bottom of the image has a waveform made of vertical bars of varying heights like an audio visualizer frozen in time.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  // Generate waveform bars with varying heights
  const barHeights = [
    35, 55, 28, 72, 40, 60, 25, 80, 45, 32, 68, 50, 38, 75, 30, 58, 42, 65, 35, 48, 70, 28, 55, 62,
    33, 78, 44, 52, 36, 67, 40, 58, 25, 73, 46, 54, 30, 64, 38, 50, 72, 32, 60, 45, 35, 76, 42, 56,
    28, 68, 48, 34, 62, 40, 70, 30, 54, 44, 66, 36, 58, 26, 74, 46, 52, 32, 80, 38, 60, 42, 50, 28,
    72, 34, 56, 44, 64, 36, 48, 30, 68, 40, 55, 32, 76, 46, 58, 26, 70, 38, 62, 42, 52, 34, 78, 44,
    54, 30, 66, 48, 60, 28, 74, 36, 50, 40, 72, 32, 56, 46, 64, 34, 80, 38, 52, 42, 68, 30, 58, 44,
  ];

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '1200px',
        height: '630px',
        backgroundColor: '#0a0e17',
        position: 'relative',
        flexDirection: 'column',
      }}
    >
      {/* Content area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flexGrow: 1,
          padding: '50px 60px 30px 60px',
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

      {/* Waveform at bottom */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          height: 100,
          width: '100%',
          paddingBottom: 0,
        }}
      >
        {barHeights.map((h, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              width: 8,
              height: h,
              backgroundColor: `rgba(0, ${180 + Math.floor((h / 80) * 75)}, ${200 + Math.floor((h / 80) * 55)}, ${0.5 + (h / 80) * 0.4})`,
              marginRight: 2,
              borderRadius: '2px 2px 0 0',
            }}
          />
        ))}
      </div>
    </div>,
    size,
  );
}
