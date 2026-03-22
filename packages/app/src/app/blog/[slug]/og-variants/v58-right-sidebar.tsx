/**
 * V58: Right Sidebar — Main content on left 70%, right 30% has a lighter info panel
 * with author, date, reading time, and tags stacked vertically. Large bold title on left.
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
      {/* Left 70% main content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: 840,
          padding: '50px 56px',
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
            {meta.excerpt.length > 120 ? meta.excerpt.slice(0, 120) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Spacer */}
        <div style={{ display: 'flex' }} />
      </div>

      {/* Right 30% sidebar */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          width: 360,
          height: '100%',
          backgroundColor: '#161618',
          borderLeft: '1px solid #2a2a2e',
          padding: '40px 32px',
          gap: 32,
        }}
      >
        {/* Author */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 14,
              color: '#6b6b78',
              textTransform: 'uppercase',
              letterSpacing: 2,
            }}
          >
            Author
          </div>
          <div style={{ display: 'flex', fontSize: 22, fontWeight: 600, color: '#e0e0e4' }}>
            {meta.author}
          </div>
        </div>

        {/* Date */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 14,
              color: '#6b6b78',
              textTransform: 'uppercase',
              letterSpacing: 2,
            }}
          >
            Published
          </div>
          <div style={{ display: 'flex', fontSize: 20, color: '#b0b0ba' }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </div>
        </div>

        {/* Reading time */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 14,
              color: '#6b6b78',
              textTransform: 'uppercase',
              letterSpacing: 2,
            }}
          >
            Read Time
          </div>
          <div style={{ display: 'flex', fontSize: 20, color: '#b0b0ba' }}>
            {meta.readingTime} min
          </div>
        </div>

        {/* Tags */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 14,
              color: '#6b6b78',
              textTransform: 'uppercase',
              letterSpacing: 2,
            }}
          >
            Tags
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {meta.tags &&
              meta.tags.slice(0, 4).map((tag) => (
                <div
                  key={tag}
                  style={{
                    display: 'flex',
                    fontSize: 16,
                    color: '#a0d4cf',
                    border: '1px solid #2dd4bf30',
                    borderRadius: 4,
                    padding: '4px 10px',
                  }}
                >
                  {tag}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
