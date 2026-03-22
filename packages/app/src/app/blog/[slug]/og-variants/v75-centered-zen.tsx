/**
 * V75: Centered Zen — Everything perfectly centered vertically and horizontally.
 * Logo centered top, title centered middle, author+date centered bottom. Generous
 * whitespace. Peaceful, balanced. Minimal decorative elements.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 44 : meta.title.length > 40 ? 52 : 60;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#111111',
        padding: '60px 80px',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      {/* Logo — centered top */}
      <div style={{ display: 'flex' }}>
        <img src={logoSrc} width={140} height={36} />
      </div>

      {/* Title — centered middle */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: titleSize,
            fontWeight: 600,
            color: '#f5f5f5',
            lineHeight: 1.3,
            textAlign: 'center',
            letterSpacing: '0.5px',
          }}
        >
          {meta.title}
        </div>
      </div>

      {/* Author + date — centered bottom */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 20,
          color: '#888',
        }}
      >
        <div style={{ display: 'flex' }}>{meta.author}</div>
        <div
          style={{
            display: 'flex',
            width: '4px',
            height: '4px',
            borderRadius: '2px',
            backgroundColor: '#555',
            marginLeft: '20px',
            marginRight: '20px',
          }}
        />
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
