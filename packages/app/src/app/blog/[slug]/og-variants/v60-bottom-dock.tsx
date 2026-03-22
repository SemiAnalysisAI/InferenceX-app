/**
 * V60: Bottom Dock — Content (logo, title, excerpt) in the upper area. A distinct bottom
 * panel with a different bg shade acts as a dock with author, date, reading time, tags in a row.
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
        backgroundColor: '#0c0c0e',
        color: '#fafafa',
        overflow: 'hidden',
      }}
    >
      {/* Upper content area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 1,
          padding: '50px 60px 40px',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} height={32} />
        </div>

        {/* Title + excerpt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 700,
              lineHeight: 1.2,
              color: '#ffffff',
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 26,
              color: '#a1a1aa',
              lineHeight: 1.4,
              maxHeight: 80,
              overflow: 'hidden',
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>
      </div>

      {/* Bottom dock panel */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          height: 100,
          backgroundColor: '#161619',
          borderTop: '1px solid #2a2a30',
          padding: '0 60px',
        }}
      >
        {/* Left side: author, date, reading time */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 20, color: '#9090a0' }}
        >
          <span style={{ fontWeight: 600, color: '#d0d0d8' }}>{meta.author}</span>
          <div
            style={{
              display: 'flex',
              width: 1,
              height: 20,
              backgroundColor: '#3a3a44',
            }}
          />
          <span>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <div
            style={{
              display: 'flex',
              width: 1,
              height: 20,
              backgroundColor: '#3a3a44',
            }}
          />
          <span>{meta.readingTime} min read</span>
        </div>

        {/* Right side: tags */}
        <div style={{ display: 'flex', gap: 10 }}>
          {meta.tags &&
            meta.tags.slice(0, 3).map((tag) => (
              <div
                key={tag}
                style={{
                  display: 'flex',
                  fontSize: 16,
                  color: '#a0d4cf',
                  border: '1px solid #2dd4bf30',
                  borderRadius: 4,
                  padding: '4px 12px',
                }}
              >
                {tag}
              </div>
            ))}
        </div>
      </div>
    </div>,
    size,
  );
}
