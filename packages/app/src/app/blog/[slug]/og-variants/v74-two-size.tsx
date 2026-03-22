/**
 * V74: Two-Size Title — First word is HUGE (96px, gold), remaining words are normal
 * size (48px, white) on the next line. Creates visual hierarchy within the title itself.
 * Dynamic, editorial.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;

  const words = meta.title.split(/\s+/);
  const firstWord = words[0] || '';
  const remainingWords = words.slice(1).join(' ');

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0c0c0c',
        padding: '60px 70px',
        justifyContent: 'space-between',
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex' }}>
        <img src={logoSrc} width={130} height={34} />
      </div>

      {/* Two-size title */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
        }}
      >
        {/* First word — massive and gold */}
        <div
          style={{
            display: 'flex',
            fontSize: 96,
            fontWeight: 900,
            color: '#d4a843',
            lineHeight: 1.0,
            letterSpacing: '-1px',
          }}
        >
          {firstWord}
        </div>

        {/* Remaining words — smaller and white */}
        {remainingWords && (
          <div
            style={{
              display: 'flex',
              fontSize: 48,
              fontWeight: 600,
              color: '#e0e0e0',
              lineHeight: 1.25,
              marginTop: '8px',
            }}
          >
            {remainingWords}
          </div>
        )}
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
          borderTop: '1px solid #222',
          paddingTop: '16px',
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
