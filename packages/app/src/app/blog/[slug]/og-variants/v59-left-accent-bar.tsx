/**
 * V59: Left Accent Bar — A 6px wide gold vertical bar on the far left edge.
 * Content indented from it, creating a pull-quote / editorial margin note feel. Very clean.
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
        backgroundColor: '#0e0e10',
        color: '#fafafa',
        overflow: 'hidden',
      }}
    >
      {/* Gold accent bar */}
      <div
        style={{
          display: 'flex',
          width: 6,
          height: '100%',
          backgroundColor: '#F7B041',
        }}
      />

      {/* Content indented from the bar */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 1,
          padding: '56px 64px 56px 48px',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} height={30} />
        </div>

        {/* Title + excerpt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 700,
              lineHeight: 1.15,
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
              maxHeight: 76,
              overflow: 'hidden',
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 22, color: '#8a8a96' }}
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
      </div>
    </div>,
    size,
  );
}
