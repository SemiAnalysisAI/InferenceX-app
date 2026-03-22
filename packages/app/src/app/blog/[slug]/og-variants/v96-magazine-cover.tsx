/**
 * V96: Magazine Cover — Bold masthead with high-fashion magazine feel. White on black.
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
        backgroundColor: '#000000',
        color: '#ffffff',
        padding: '50px 60px',
        fontFamily: 'sans-serif',
        position: 'relative',
      }}
    >
      {/* Masthead */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          width: '100%',
          borderBottom: '1px solid #444444',
          paddingBottom: '14px',
        }}
      >
        <span
          style={{
            fontSize: 22,
            letterSpacing: '0.35em',
            textTransform: 'uppercase' as const,
            color: '#cccccc',
          }}
        >
          InferenceX
        </span>
      </div>

      {/* Issue date line */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          width: '100%',
          marginTop: '10px',
        }}
      >
        <span style={{ fontSize: 14, color: '#888888', letterSpacing: '0.2em' }}>
          {new Date(meta.date + 'T00:00:00Z')
            .toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })
            .toUpperCase()}{' '}
          ISSUE
        </span>
      </div>

      {/* Main title — huge and centered */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          width: '100%',
        }}
      >
        <span
          style={{
            fontSize: titleSize + 16,
            fontWeight: 900,
            textAlign: 'center',
            lineHeight: 1.05,
            maxWidth: '90%',
          }}
        >
          {meta.title}
        </span>
      </div>

      {/* Cover lines (excerpt) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          width: '100%',
          marginBottom: '10px',
        }}
      >
        <span
          style={{
            fontSize: 18,
            color: '#aaaaaa',
            textAlign: 'center',
            maxWidth: '80%',
            lineHeight: 1.5,
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
        </span>
      </div>

      {/* Author line */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          width: '100%',
          borderTop: '1px solid #444444',
          paddingTop: '16px',
        }}
      >
        <span style={{ fontSize: 16, color: '#cccccc', letterSpacing: '0.15em' }}>
          By {meta.author}
        </span>
      </div>

      {/* Logo watermark bottom-right */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: '20px',
          right: '30px',
        }}
      >
        <img src={logoSrc} width={28} height={28} />
      </div>
    </div>,
    size,
  );
}
