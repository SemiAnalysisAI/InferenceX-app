/**
 * V120: Retro VHS — VHS tracking distortion with offset colored text layers and scan lines in pink/purple/cyan palette.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  // Generate scan line elements
  const scanLines = Array.from({ length: 63 }, (_, i) => (
    <div
      key={i}
      style={{
        display: 'flex',
        position: 'absolute',
        left: 0,
        right: 0,
        top: `${i * 10}px`,
        height: '1px',
        backgroundColor: '#000000',
        opacity: 0.15,
      }}
    />
  ));

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0d0118',
        color: '#ffffff',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Scan lines overlay */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 3,
        }}
      >
        {scanLines}
      </div>

      {/* Cyan offset title layer */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '198px',
          left: '58px',
          right: '56px',
          fontSize: titleSize,
          fontWeight: 800,
          lineHeight: 1.15,
          color: '#00ffff',
          opacity: 0.4,
        }}
      >
        {meta.title}
      </div>

      {/* Red offset title layer */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '202px',
          left: '52px',
          right: '56px',
          fontSize: titleSize,
          fontWeight: 800,
          lineHeight: 1.15,
          color: '#ff0040',
          opacity: 0.4,
        }}
      >
        {meta.title}
      </div>

      {/* Main content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: '44px 56px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {/* Top: Logo + REC indicator */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img src={logoSrc} width={40} height={40} />
            <div
              style={{
                display: 'flex',
                marginLeft: '12px',
                fontSize: 20,
                fontWeight: 700,
                color: '#e040fb',
              }}
            >
              InferenceX
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                display: 'flex',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: '#ff0040',
              }}
            />
            <div
              style={{
                display: 'flex',
                fontSize: 18,
                fontWeight: 700,
                color: '#ff0040',
                letterSpacing: '2px',
              }}
            >
              REC
            </div>
          </div>
        </div>

        {/* Middle: Title (primary layer) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 800,
              lineHeight: 1.15,
              color: '#ffffff',
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 19,
              color: '#c084fc',
              lineHeight: 1.5,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Bottom: Author + Date + VHS style timestamp */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', fontSize: 18, color: '#00ffff' }}>{meta.author}</div>
          <div
            style={{
              display: 'flex',
              fontSize: 16,
              color: '#e040fb',
              letterSpacing: '1px',
            }}
          >
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
