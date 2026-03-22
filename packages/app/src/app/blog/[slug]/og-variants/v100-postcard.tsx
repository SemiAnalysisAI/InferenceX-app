/**
 * V100: Postcard — Right side content, left side decorative stamp area, address-line formatting.
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
        backgroundColor: '#fefcf8',
        color: '#2a2a2a',
        padding: '20px',
        fontFamily: 'serif',
        position: 'relative',
      }}
    >
      {/* Outer border — postcard edge */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          border: '2px solid #b5a88a',
          position: 'relative',
        }}
      >
        {/* Left side — decorative */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '40%',
            height: '100%',
            padding: '30px',
            position: 'relative',
          }}
        >
          {/* Stamp area — top-left bordered square */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '100px',
              height: '120px',
              border: '2px solid #8a7d6b',
              padding: '10px',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'absolute',
              top: '25px',
              right: '30px',
            }}
          >
            <span
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: '#6b5e4f',
              }}
            >
              {meta.readingTime}
            </span>
            <span
              style={{
                fontSize: 10,
                color: '#8a7d6b',
                letterSpacing: '0.1em',
                marginTop: '2px',
              }}
            >
              MIN READ
            </span>
          </div>

          {/* Logo at bottom-left of left panel */}
          <div
            style={{
              display: 'flex',
              position: 'absolute',
              bottom: '30px',
              left: '30px',
              alignItems: 'center',
            }}
          >
            <img src={logoSrc} width={24} height={24} />
            <span
              style={{
                fontSize: 12,
                color: '#8a7d6b',
                marginLeft: '8px',
                letterSpacing: '0.15em',
              }}
            >
              INFERENCEX
            </span>
          </div>
        </div>

        {/* Vertical divider */}
        <div
          style={{
            display: 'flex',
            width: '1px',
            backgroundColor: '#c4b8a4',
            height: '100%',
          }}
        />

        {/* Right side — content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '60%',
            height: '100%',
            padding: '35px 40px',
            justifyContent: 'center',
          }}
        >
          {/* Date */}
          <div style={{ display: 'flex', marginBottom: '16px' }}>
            <span style={{ fontSize: 13, color: '#888888' }}>
              {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC',
              })}
            </span>
          </div>

          {/* Title */}
          <div style={{ display: 'flex', marginBottom: '20px' }}>
            <span
              style={{
                fontSize: titleSize - 12,
                fontWeight: 700,
                lineHeight: 1.15,
              }}
            >
              {meta.title}
            </span>
          </div>

          {/* Excerpt */}
          <div style={{ display: 'flex', marginBottom: '24px' }}>
            <span style={{ fontSize: 15, color: '#555555', lineHeight: 1.5 }}>
              {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
            </span>
          </div>

          {/* Author — address-line style with underlines */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <span
              style={{
                fontSize: 13,
                color: '#999999',
                marginBottom: '4px',
              }}
            >
              TO:
            </span>
            <div
              style={{
                display: 'flex',
                borderBottom: '1px solid #c4b8a4',
                paddingBottom: '4px',
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 600 }}>{meta.author}</span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
