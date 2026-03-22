/**
 * V71: Highlight Marker — Highlighted text effect: title has a semi-transparent colored
 * background (like a highlighter marker). Uses backgroundColor on the title div.
 * Yellow-green highlight (#e5f54020) on dark bg.
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
        backgroundColor: '#0d0d0d',
        padding: '60px 70px',
        justifyContent: 'space-between',
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex' }}>
        <img src={logoSrc} width={130} height={34} />
      </div>

      {/* Title with highlighter effect */}
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
            color: '#f0f0f0',
            lineHeight: 1.4,
            backgroundColor: 'rgba(229, 245, 64, 0.125)',
            padding: '12px 20px',
            borderRadius: '4px',
          }}
        >
          {meta.title}
        </div>

        {/* Excerpt below */}
        <div
          style={{
            display: 'flex',
            fontSize: 22,
            color: '#888',
            lineHeight: 1.4,
            marginTop: '24px',
            paddingLeft: '4px',
          }}
        >
          {meta.excerpt && meta.excerpt.length > 110
            ? meta.excerpt.slice(0, 110) + '...'
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
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', marginRight: '20px' }}>{meta.readingTime}</div>
          <div style={{ display: 'flex' }}>
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
