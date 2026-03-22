/**
 * V70: Underline Accent — Title with thick underline: a bold colored bar (6px tall, gold)
 * directly under the title text. Simple but effective. The underline extends slightly
 * beyond the text width. Clean, modern.
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
        backgroundColor: '#111111',
        padding: '60px 70px',
        justifyContent: 'space-between',
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex' }}>
        <img src={logoSrc} width={130} height={34} />
      </div>

      {/* Title with underline accent */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
        }}
      >
        {/* Title text */}
        <div
          style={{
            display: 'flex',
            fontSize: titleSize,
            fontWeight: 700,
            color: '#ffffff',
            lineHeight: 1.25,
            marginBottom: '20px',
          }}
        >
          {meta.title}
        </div>

        {/* Thick gold underline bar */}
        <div
          style={{
            display: 'flex',
            width: '120%',
            maxWidth: '900px',
            height: '6px',
            backgroundColor: '#d4a843',
            borderRadius: '3px',
            marginLeft: '-10px',
          }}
        />

        {/* Excerpt */}
        <div
          style={{
            display: 'flex',
            fontSize: 22,
            color: '#888',
            lineHeight: 1.4,
            marginTop: '24px',
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
          color: '#777',
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
