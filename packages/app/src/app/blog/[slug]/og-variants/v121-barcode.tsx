/**
 * V121: Barcode Accent — barcode-like vertical lines at the bottom with product-info-styled date and reading time.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  // Generate barcode bars with varying widths
  const barPattern = [
    3, 1, 2, 1, 3, 2, 1, 1, 3, 1, 2, 1, 1, 3, 1, 2, 3, 1, 1, 2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 3, 1, 2,
    1, 1, 2, 3, 1, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 3, 1, 2, 1, 3, 1, 2, 1,
  ];
  let xOffset = 0;
  const bars = barPattern.map((width, i) => {
    const isBar = i % 2 === 0;
    const el = isBar ? (
      <div
        key={i}
        style={{
          display: 'flex',
          width: `${width * 2}px`,
          height: '60px',
          backgroundColor: '#ffffff',
          opacity: 0.85,
          marginLeft: `${xOffset === 0 ? 0 : 0}px`,
        }}
      />
    ) : (
      <div
        key={i}
        style={{
          display: 'flex',
          width: `${width * 2}px`,
          height: '60px',
        }}
      />
    );
    xOffset += width * 2;
    return el;
  });

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#09090b',
        color: '#ffffff',
        position: 'relative',
      }}
    >
      {/* Main content area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 1,
          padding: '44px 56px 24px 56px',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} width={44} height={44} />
          <div
            style={{
              display: 'flex',
              marginLeft: '12px',
              fontSize: 20,
              fontWeight: 700,
              color: '#c8a84e',
            }}
          >
            InferenceX
          </div>
        </div>

        {/* Title + Excerpt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 800,
              lineHeight: 1.15,
              color: '#ffffff',
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 19,
              color: '#a1a1aa',
              lineHeight: 1.5,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Author */}
        <div style={{ display: 'flex', fontSize: 18, color: '#d4d4d8' }}>{meta.author}</div>
      </div>

      {/* Barcode section */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '0 56px 32px 56px',
          gap: '8px',
        }}
      >
        {/* Barcode bars */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
          }}
        >
          {bars}
        </div>

        {/* Product-info style text below barcode */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 13,
              color: '#71717a',
              letterSpacing: '3px',
              fontWeight: 600,
            }}
          >
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 13,
              color: '#71717a',
              letterSpacing: '3px',
              fontWeight: 600,
            }}
          >
            {meta.readingTime} MIN READ
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 13,
              color: '#71717a',
              letterSpacing: '3px',
              fontWeight: 600,
            }}
          >
            IX-BLOG-{meta.date.replace(/-/g, '')}
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
