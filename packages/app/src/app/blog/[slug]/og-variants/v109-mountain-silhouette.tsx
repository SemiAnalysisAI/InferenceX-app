/**
 * V109: Mountain Silhouette — Bottom portion has layered horizontal strips creating a mountain range silhouette with a dark blue/purple palette.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  // Mountain layers from back (tallest, darkest) to front (shortest, lightest)
  const mountains = [
    {
      color: '#1a1040',
      peaks: [
        { left: 0, width: 300, height: 200 },
        { left: 250, width: 400, height: 240 },
        { left: 600, width: 350, height: 180 },
        { left: 900, width: 300, height: 220 },
      ],
      bottom: 430,
    },
    {
      color: '#241858',
      peaks: [
        { left: 100, width: 350, height: 170 },
        { left: 400, width: 300, height: 200 },
        { left: 650, width: 400, height: 160 },
        { left: 1000, width: 200, height: 190 },
      ],
      bottom: 470,
    },
    {
      color: '#2e2068',
      peaks: [
        { left: 0, width: 250, height: 130 },
        { left: 200, width: 350, height: 150 },
        { left: 500, width: 300, height: 120 },
        { left: 750, width: 450, height: 140 },
      ],
      bottom: 510,
    },
    {
      color: '#382878',
      peaks: [
        { left: 50, width: 300, height: 90 },
        { left: 300, width: 250, height: 110 },
        { left: 550, width: 350, height: 80 },
        { left: 850, width: 350, height: 100 },
      ],
      bottom: 550,
    },
  ];

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '1200px',
        height: '630px',
        backgroundColor: '#0c0820',
        position: 'relative',
      }}
    >
      {/* Mountain layers */}
      {mountains.map((layer, li) => (
        <div
          key={li}
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: '100%',
            height: 630 - layer.bottom + 250,
            zIndex: li + 1,
          }}
        >
          {/* Base fill for the layer */}
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: '100%',
              height: 630 - layer.bottom,
              backgroundColor: layer.color,
            }}
          />
          {/* Peak blocks */}
          {layer.peaks.map((peak, pi) => (
            <div
              key={pi}
              style={{
                display: 'flex',
                position: 'absolute',
                bottom: 630 - layer.bottom - 1,
                left: peak.left,
                width: peak.width,
                height: peak.height,
                backgroundColor: layer.color,
                borderRadius: '50% 50% 0 0',
              }}
            />
          ))}
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
