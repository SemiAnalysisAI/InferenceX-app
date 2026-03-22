/**
 * V118: Giant Quote Marks — huge low-opacity gold quotation characters framing the title for a literary feel.
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
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0b0b12',
        color: '#ffffff',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Opening quote mark */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: '30px',
          top: '120px',
          fontSize: 220,
          fontWeight: 700,
          color: '#c8a84e',
          opacity: 0.1,
          lineHeight: 1,
        }}
      >
        {'\u201C'}
      </div>

      {/* Closing quote mark */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: '30px',
          bottom: '100px',
          fontSize: 220,
          fontWeight: 700,
          color: '#c8a84e',
          opacity: 0.1,
          lineHeight: 1,
        }}
      >
        {'\u201D'}
      </div>

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          padding: '44px 80px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} width={44} height={44} />
          <div
            style={{
              display: 'flex',
              marginLeft: '12px',
              fontSize: 20,
              fontWeight: 700,
              color: '#c8a84e',
            }}
          >
            InferenceX
          </div>
        </div>

        {/* Title — centered for the quote feel */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
            padding: '0 40px',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 700,
              lineHeight: 1.2,
              color: '#ffffff',
              textAlign: 'center',
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 18,
              color: '#9ca3af',
              textAlign: 'center',
              lineHeight: 1.5,
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
          <div style={{ display: 'flex', fontSize: 18, color: '#c8a84e' }}>{meta.author}</div>
          <div style={{ display: 'flex', fontSize: 16, color: '#6b7280' }}>
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
