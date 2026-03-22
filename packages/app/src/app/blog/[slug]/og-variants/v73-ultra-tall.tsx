/**
 * V73: Ultra Tall — Very large fontSize (80-96px) but narrow letterSpacing (-2px).
 * Title dominates vertically. Minimal other content. Logo tiny in corner. Date small
 * at bottom. All about the title presence.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;

  const displayTitle = meta.title.length > 50 ? meta.title.slice(0, 50) + '...' : meta.title;
  const titleSize = displayTitle.length > 40 ? 72 : 88;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#090909',
        padding: '40px 60px',
        justifyContent: 'space-between',
      }}
    >
      {/* Tiny logo in top-left corner */}
      <div style={{ display: 'flex' }}>
        <img src={logoSrc} width={90} height={24} />
      </div>

      {/* Massive title — dominates the frame */}
      <div
        style={{
          display: 'flex',
          fontSize: titleSize,
          fontWeight: 800,
          color: '#ffffff',
          lineHeight: 1.0,
          letterSpacing: '-2px',
        }}
      >
        {displayTitle}
      </div>

      {/* Minimal footer — small date and author */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 16,
          color: '#555',
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
