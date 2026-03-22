/**
 * V69: Stacked Words — Each word of the title on its own line. Uses large fontSize
 * and tight lineHeight. Creates a vertical waterfall of text. Left-aligned. Bold weight.
 * Trims to first 5-6 words if title is long.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;

  const words = meta.title.split(/\s+/);
  const displayWords = words.length > 6 ? words.slice(0, 6) : words;
  const wordCount = displayWords.length;
  const wordSize = wordCount > 5 ? 52 : wordCount > 4 ? 58 : 64;

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

      {/* Stacked words */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
        }}
      >
        {displayWords.map((word, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              fontSize: wordSize,
              fontWeight: 800,
              color: i === 0 ? '#d4a843' : '#e0e0e0',
              lineHeight: 1.05,
              letterSpacing: '-1px',
            }}
          >
            {word}
          </div>
        ))}
        {words.length > 6 && (
          <div
            style={{
              display: 'flex',
              fontSize: wordSize,
              fontWeight: 800,
              color: '#555',
              lineHeight: 1.05,
            }}
          >
            ...
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          fontSize: 20,
          color: '#777',
        }}
      >
        <div style={{ display: 'flex' }}>{meta.author}</div>
        <div
          style={{
            display: 'flex',
            marginLeft: '16px',
            marginRight: '16px',
            color: '#444',
          }}
        >
          /
        </div>
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
