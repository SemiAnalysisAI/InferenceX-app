/**
 * V72: Title Badge — Title wrapped in a large bordered rectangle with rounded corners
 * (borderRadius 16). Badge has a subtle border and slightly different bg. Makes the
 * title feel like a label/tag. Content below.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 42 : meta.title.length > 40 ? 48 : 56;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0e0e0e',
        padding: '50px 60px',
        justifyContent: 'space-between',
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex' }}>
        <img src={logoSrc} width={130} height={34} />
      </div>

      {/* Badge with title */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: titleSize,
            fontWeight: 700,
            color: '#ffffff',
            lineHeight: 1.3,
            border: '2px solid #333',
            borderRadius: '16px',
            backgroundColor: '#161616',
            padding: '28px 36px',
          }}
        >
          {meta.title}
        </div>

        {/* Excerpt below badge */}
        <div
          style={{
            display: 'flex',
            fontSize: 21,
            color: '#777',
            lineHeight: 1.4,
            marginTop: '20px',
            paddingLeft: '8px',
          }}
        >
          {meta.excerpt && meta.excerpt.length > 100
            ? meta.excerpt.slice(0, 100) + '...'
            : meta.excerpt}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 20,
          color: '#666',
        }}
      >
        <div style={{ display: 'flex' }}>{meta.author}</div>
        <div style={{ display: 'flex' }}>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </div>
      </div>
    </div>,
    size,
  );
}
