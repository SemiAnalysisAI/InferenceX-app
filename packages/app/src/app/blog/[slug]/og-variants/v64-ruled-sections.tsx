/**
 * V64: Ruled Sections — Header/body/footer with divider lines. Three clear sections
 * separated by thin horizontal lines. Header: logo + label. Body: title + excerpt.
 * Footer: author + date + tags. Like a structured document.
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
        padding: '0 60px',
        overflow: 'hidden',
      }}
    >
      {/* Header section */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 100,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <img src={logoSrc} height={30} />
          <div
            style={{
              display: 'flex',
              fontSize: 20,
              color: '#8a8a96',
              fontWeight: 500,
              letterSpacing: 1,
            }}
          >
            InferenceX Blog
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 18, color: '#6b6b78' }}>
          {meta.readingTime} min read
        </div>
      </div>

      {/* Top divider */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 1,
          backgroundColor: '#2a2a30',
        }}
      />

      {/* Body section (takes most space) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          flex: 1,
          gap: 20,
          padding: '30px 0',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: titleSize,
            fontWeight: 700,
            lineHeight: 1.18,
            color: '#ffffff',
          }}
        >
          {meta.title}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 26,
            color: '#94949e',
            lineHeight: 1.45,
            maxHeight: 80,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 150 ? meta.excerpt.slice(0, 150) + '\u2026' : meta.excerpt}
        </div>
      </div>

      {/* Bottom divider */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 1,
          backgroundColor: '#2a2a30',
        }}
      />

      {/* Footer section */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 90,
        }}
      >
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 21, color: '#8a8a96' }}
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
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {meta.tags &&
            meta.tags.slice(0, 4).map((tag) => (
              <div
                key={tag}
                style={{
                  display: 'flex',
                  fontSize: 16,
                  color: '#a0d4cf',
                  border: '1px solid #2dd4bf28',
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
