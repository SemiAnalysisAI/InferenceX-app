/**
 * V62: Card-in-Card — Outer frame has a slightly lighter bg, inner card with visible
 * border and borderRadius contains all content. Floating card effect with 24px gap.
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
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        backgroundColor: '#141416',
        overflow: 'hidden',
      }}
    >
      {/* Inner floating card */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: 1152,
          height: 582,
          backgroundColor: '#0a0a0c',
          border: '1px solid #2a2a30',
          borderRadius: 16,
          padding: '44px 52px',
        }}
      >
        {/* Header: logo + tags */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <img src={logoSrc} height={30} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {meta.tags &&
              meta.tags.slice(0, 3).map((tag) => (
                <div
                  key={tag}
                  style={{
                    display: 'flex',
                    fontSize: 16,
                    color: '#a0d4cf',
                    border: '1px solid #2dd4bf25',
                    borderRadius: 6,
                    padding: '4px 12px',
                  }}
                >
                  {tag}
                </div>
              ))}
          </div>
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
              maxHeight: 76,
              overflow: 'hidden',
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              fontSize: 21,
              color: '#8a8a96',
            }}
          >
            <span style={{ fontWeight: 600, color: '#c8c8d0' }}>{meta.author}</span>
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

          {/* Gold accent dot */}
          <div
            style={{
              display: 'flex',
              width: 10,
              height: 10,
              backgroundColor: '#F7B041',
              borderRadius: 5,
            }}
          />
        </div>
      </div>
    </div>,
    size,
  );
}
