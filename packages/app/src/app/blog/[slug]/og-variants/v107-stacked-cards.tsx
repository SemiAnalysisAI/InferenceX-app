/**
 * V107: Stacked Cards — 3 layered card rectangles slightly offset behind the main content card creating a paper-stack depth illusion.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '1200px',
        height: '630px',
        backgroundColor: '#0f1218',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      {/* Background card 3 (deepest) */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 58,
          left: 78,
          width: 1060,
          height: 530,
          backgroundColor: '#1a1f2e',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      />

      {/* Background card 2 */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 50,
          left: 72,
          width: 1060,
          height: 530,
          backgroundColor: '#1e2436',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      />

      {/* Background card 1 */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 42,
          left: 66,
          width: 1060,
          height: 530,
          backgroundColor: '#232a3e',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.10)',
        }}
      />

      {/* Main content card */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'absolute',
          top: 34,
          left: 60,
          width: 1060,
          height: 530,
          backgroundColor: '#141926',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.12)',
          padding: '48px',
          zIndex: 10,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} width={44} height={44} />
          <span
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#ffffff',
              marginLeft: 14,
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
              fontSize: 21,
              color: 'rgba(255,255,255,0.55)',
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
          <div style={{ display: 'flex', fontSize: 17, color: 'rgba(255,255,255,0.45)' }}>
            {meta.author}
          </div>
          <div style={{ display: 'flex', fontSize: 17, color: 'rgba(255,255,255,0.45)' }}>
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
