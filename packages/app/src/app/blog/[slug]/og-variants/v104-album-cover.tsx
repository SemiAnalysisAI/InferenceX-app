/**
 * V104: Album Cover — Vinyl record cover aesthetic with centered square-ish content region.
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
        width: '100%',
        height: '100%',
        backgroundColor: '#0d0d0d',
        fontFamily: 'sans-serif',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
      }}
    >
      {/* Centered square-ish album cover region */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '560px',
          height: '520px',
          backgroundColor: '#181818',
          border: '1px solid #333333',
          padding: '50px 45px',
          position: 'relative',
        }}
      >
        {/* Record label / logo top-left */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <img src={logoSrc} width={18} height={18} />
          <span
            style={{
              fontSize: 11,
              color: '#666666',
              marginLeft: '8px',
              letterSpacing: '0.2em',
            }}
          >
            INFERENCEX RECORDS
          </span>
        </div>

        {/* Spacer */}
        <div style={{ display: 'flex', flex: 1 }} />

        {/* Album title */}
        <div style={{ display: 'flex', marginBottom: '14px' }}>
          <span
            style={{
              fontSize: titleSize + 4,
              fontWeight: 900,
              color: '#ffffff',
              lineHeight: 1.05,
            }}
          >
            {meta.title}
          </span>
        </div>

        {/* Artist name */}
        <div style={{ display: 'flex', marginBottom: '20px' }}>
          <span
            style={{
              fontSize: 22,
              fontWeight: 300,
              color: '#cccccc',
              letterSpacing: '0.05em',
            }}
          >
            {meta.author}
          </span>
        </div>

        {/* Thin separator */}
        <div
          style={{
            display: 'flex',
            width: '40px',
            height: '2px',
            backgroundColor: '#555555',
            marginBottom: '14px',
          }}
        />

        {/* Track listing hint (tags) */}
        <div style={{ display: 'flex' }}>
          <span style={{ fontSize: 12, color: '#555555', letterSpacing: '0.08em' }}>
            {meta.tags ? meta.tags.join(' / ') : ''}
          </span>
        </div>
      </div>

      {/* Year on spine — far left */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: '40px',
          bottom: '40px',
        }}
      >
        <span style={{ fontSize: 12, color: '#444444' }}>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
      </div>

      {/* Duration — far right */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: '40px',
          bottom: '40px',
        }}
      >
        <span style={{ fontSize: 12, color: '#444444' }}>{meta.readingTime} min</span>
      </div>
    </div>,
    size,
  );
}
