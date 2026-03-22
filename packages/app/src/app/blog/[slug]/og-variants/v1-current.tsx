/**
 * V1: Current — Plain dark background, no pattern.
 * Clean and minimal, text-only layout.
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
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        backgroundColor: '#18181b',
        color: '#fafafa',
        padding: 60,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <img src={logoSrc} height={96} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.2 }}>{meta.title}</div>
        <div
          style={{
            fontSize: 28,
            color: '#a1a1aa',
            lineHeight: 1.4,
            maxHeight: 80,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '...' : meta.excerpt}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, fontSize: 24, color: '#a1a1aa' }}>
        <span>{meta.author}</span>
        <span>·</span>
        <span>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
        <span>·</span>
        <span>{meta.readingTime} min read</span>
        {meta.tags &&
          meta.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              style={{
                backgroundColor: '#27272a',
                padding: '4px 12px',
                borderRadius: 9999,
                fontSize: 20,
              }}
            >
              {tag}
            </span>
          ))}
      </div>
    </div>,
    size,
  );
}
