/**
 * V66: Drop Cap — Giant drop cap: the first letter of the title is rendered as a massive
 * (200px) character in gold, positioned behind/beside the rest of the title.
 * Creates a manuscript/book feel. Dark bg.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  const firstLetter = meta.title.charAt(0).toUpperCase();
  const restOfTitle = meta.title.slice(1);

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0f0f0f',
        padding: '60px',
        position: 'relative',
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', marginBottom: '40px' }}>
        <img src={logoSrc} width={140} height={36} />
      </div>

      {/* Title area with drop cap */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'flex-start',
          flex: 1,
        }}
      >
        {/* Drop cap letter */}
        <div
          style={{
            display: 'flex',
            fontSize: 200,
            fontWeight: 900,
            color: '#d4a843',
            lineHeight: 0.8,
            marginRight: '12px',
            marginTop: '-10px',
            opacity: 0.9,
          }}
        >
          {firstLetter}
        </div>

        {/* Rest of title */}
        <div
          style={{
            display: 'flex',
            fontSize: titleSize,
            fontWeight: 700,
            color: '#e8e8e8',
            lineHeight: 1.2,
            paddingTop: '10px',
            flex: 1,
          }}
        >
          {restOfTitle}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid #333',
          paddingTop: '20px',
        }}
      >
        <div style={{ display: 'flex', fontSize: 22, color: '#999' }}>{meta.author}</div>
        <div style={{ display: 'flex', fontSize: 22, color: '#999' }}>
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
