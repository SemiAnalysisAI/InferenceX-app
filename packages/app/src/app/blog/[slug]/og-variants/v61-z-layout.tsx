/**
 * V61: Z-Layout — Logo top-left, horizontal line across top, title center-right,
 * diagonal connecting element, date/author bottom-left. Eye follows a Z-path across the card.
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
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top horizontal line (Z top stroke) */}
      <div
        style={{
          position: 'absolute',
          left: 60,
          top: 80,
          width: 1080,
          height: 1,
          backgroundColor: '#2dd4bf30',
          display: 'flex',
        }}
      />

      {/* Diagonal connector elements (Z middle stroke) */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={`d${i}`}
          style={{
            position: 'absolute',
            left: 900 - i * 100,
            top: 130 + i * 45,
            width: 40,
            height: 2,
            backgroundColor: i === 3 ? '#F7B04130' : '#2dd4bf15',
            display: 'flex',
          }}
        />
      ))}

      {/* Small diamond accents along the diagonal */}
      <div
        style={{
          position: 'absolute',
          left: 720,
          top: 240,
          width: 8,
          height: 8,
          backgroundColor: '#F7B04150',
          borderRadius: 1,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 520,
          top: 330,
          width: 6,
          height: 6,
          backgroundColor: '#2dd4bf40',
          borderRadius: 1,
          display: 'flex',
        }}
      />

      {/* Bottom horizontal line (Z bottom stroke) */}
      <div
        style={{
          position: 'absolute',
          left: 60,
          top: 550,
          width: 1080,
          height: 1,
          backgroundColor: '#2dd4bf30',
          display: 'flex',
        }}
      />

      {/* Z top-left: Logo */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '36px 60px',
          zIndex: 1,
        }}
      >
        <img src={logoSrc} height={32} />
      </div>

      {/* Z center-right: Title + excerpt */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          padding: '20px 60px 0 300px',
          gap: 14,
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: titleSize,
            fontWeight: 700,
            lineHeight: 1.2,
            color: '#ffffff',
            textAlign: 'right',
          }}
        >
          {meta.title}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 24,
            color: '#a1a1aa',
            lineHeight: 1.4,
            textAlign: 'right',
            maxHeight: 70,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 120 ? meta.excerpt.slice(0, 120) + '\u2026' : meta.excerpt}
        </div>
      </div>

      {/* Z bottom-left: Author + date */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          position: 'absolute',
          left: 60,
          bottom: 36,
          gap: 24,
          fontSize: 22,
          color: '#9090a0',
          zIndex: 1,
        }}
      >
        <span style={{ fontWeight: 600, color: '#d0d0d8' }}>{meta.author}</span>
        <span>{'\u00b7'}</span>
        <span>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
        <span>{'\u00b7'}</span>
        <span>{meta.readingTime} min read</span>
      </div>

      {/* Tags bottom-right */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: 60,
          bottom: 36,
          gap: 10,
          zIndex: 1,
        }}
      >
        {meta.tags &&
          meta.tags.slice(0, 3).map((tag) => (
            <div
              key={tag}
              style={{
                display: 'flex',
                fontSize: 16,
                color: '#7ab0aa',
                border: '1px solid #2dd4bf25',
                borderRadius: 4,
                padding: '4px 10px',
              }}
            >
              {tag}
            </div>
          ))}
      </div>
    </div>,
    size,
  );
}
