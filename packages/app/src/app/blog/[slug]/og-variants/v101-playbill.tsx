/**
 * V101: Playbill — Dramatic theater playbill with elegant presentation and cast listing.
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
        backgroundColor: '#1a0a0a',
        color: '#f0e6d2',
        padding: '40px 70px',
        fontFamily: 'serif',
        position: 'relative',
        alignItems: 'center',
      }}
    >
      {/* Decorative top border */}
      <div
        style={{
          display: 'flex',
          width: '80%',
          borderTop: '2px solid #8b6914',
          marginBottom: '4px',
        }}
      />
      <div
        style={{
          display: 'flex',
          width: '78%',
          borderTop: '1px solid #8b6914',
        }}
      />

      {/* "InferenceX PRESENTS" */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginTop: '20px',
        }}
      >
        <img src={logoSrc} width={20} height={20} />
        <span
          style={{
            fontSize: 16,
            letterSpacing: '0.35em',
            marginLeft: '10px',
            color: '#c9a84c',
          }}
        >
          InferenceX PRESENTS
        </span>
      </div>

      {/* Main title — huge and dramatic */}
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
            fontSize: titleSize + 12,
            fontWeight: 900,
            textAlign: 'center',
            lineHeight: 1.05,
            maxWidth: '90%',
            color: '#ffffff',
          }}
        >
          {meta.title}
        </span>
      </div>

      {/* Written by */}
      <div
        style={{
          display: 'flex',
          marginBottom: '14px',
        }}
      >
        <span style={{ fontSize: 18, fontStyle: 'italic', color: '#d4c5a0' }}>
          Written by {meta.author}
        </span>
      </div>

      {/* Opening date */}
      <div
        style={{
          display: 'flex',
          marginBottom: '20px',
        }}
      >
        <span style={{ fontSize: 14, color: '#a0926e', letterSpacing: '0.1em' }}>
          Opening{' '}
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
      </div>

      {/* Tags as "Starring" */}
      <div
        style={{
          display: 'flex',
          marginBottom: '18px',
        }}
      >
        <span style={{ fontSize: 13, color: '#8a7d5e' }}>
          Starring: {meta.tags ? meta.tags.join(' \u00b7 ') : ''}
        </span>
      </div>

      {/* Decorative bottom border */}
      <div
        style={{
          display: 'flex',
          width: '78%',
          borderTop: '1px solid #8b6914',
          marginBottom: '4px',
        }}
      />
      <div
        style={{
          display: 'flex',
          width: '80%',
          borderTop: '2px solid #8b6914',
        }}
      />
    </div>,
    size,
  );
}
