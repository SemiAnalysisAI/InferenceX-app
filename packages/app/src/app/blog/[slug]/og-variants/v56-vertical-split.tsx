/**
 * V56: Vertical Split — 40/60 vertical split with left teal panel and right dark area.
 * Logo and tags in the left panel, title and excerpt on the right. Thin gold divider line.
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
        width: '100%',
        height: '100%',
        backgroundColor: '#0c0c0e',
        color: '#fafafa',
        overflow: 'hidden',
      }}
    >
      {/* Left 40% teal panel */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: 480,
          height: '100%',
          backgroundColor: '#1a3a3a',
          padding: '50px 40px',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} height={32} />
        </div>

        {/* Tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {meta.tags &&
            meta.tags.slice(0, 4).map((tag) => (
              <div
                key={tag}
                style={{
                  display: 'flex',
                  fontSize: 18,
                  color: '#a0d4cf',
                  border: '1px solid #2dd4bf40',
                  borderRadius: 6,
                  padding: '6px 14px',
                }}
              >
                {tag}
              </div>
            ))}
        </div>

        {/* Author + date */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', fontSize: 22, color: '#d0e8e5', fontWeight: 600 }}>
            {meta.author}
          </div>
          <div style={{ display: 'flex', fontSize: 18, color: '#7ab0aa' }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
            {' \u00b7 '}
            {meta.readingTime} min read
          </div>
        </div>
      </div>

      {/* Gold divider line */}
      <div
        style={{
          display: 'flex',
          width: 3,
          height: '100%',
          backgroundColor: '#F7B041',
        }}
      />

      {/* Right 60% dark content area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          flex: 1,
          padding: '50px 56px',
          gap: 20,
        }}
      >
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
          {meta.excerpt.length > 130 ? meta.excerpt.slice(0, 130) + '\u2026' : meta.excerpt}
        </div>
      </div>
    </div>,
    size,
  );
}
