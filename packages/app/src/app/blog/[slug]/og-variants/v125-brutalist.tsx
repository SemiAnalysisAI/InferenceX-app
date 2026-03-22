/**
 * V125: Brutalist — harsh, raw design with thick borders, high contrast black/white, loud red accent. Anti-design aesthetic.
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
        backgroundColor: '#ffffff',
        color: '#000000',
        padding: '12px',
        borderRadius: 0,
      }}
    >
      {/* Inner container with thick border */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          border: '10px solid #000000',
          borderRadius: 0,
          position: 'relative',
        }}
      >
        {/* Red accent bar — left side */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            left: '0px',
            top: '0px',
            width: '12px',
            height: '100%',
            backgroundColor: '#ff0000',
          }}
        />

        {/* Content area */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            padding: '32px 40px 32px 44px',
          }}
        >
          {/* Top: Logo + BLOG label */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <img src={logoSrc} width={44} height={44} />
              <div
                style={{
                  display: 'flex',
                  marginLeft: '12px',
                  fontSize: 24,
                  fontWeight: 900,
                  color: '#000000',
                  letterSpacing: '-1px',
                }}
              >
                INFERENCEX
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                backgroundColor: '#ff0000',
                padding: '6px 20px',
                borderRadius: 0,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  fontSize: 16,
                  fontWeight: 900,
                  color: '#ffffff',
                  letterSpacing: '4px',
                }}
              >
                BLOG
              </div>
            </div>
          </div>

          {/* Middle: Title — large and bold */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div
              style={{
                display: 'flex',
                fontSize: titleSize,
                fontWeight: 900,
                lineHeight: 1.05,
                color: '#000000',
                letterSpacing: '-2px',
              }}
            >
              {meta.title}
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 18,
                color: '#444444',
                lineHeight: 1.4,
                fontWeight: 500,
              }}
            >
              {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
            </div>
          </div>

          {/* Bottom: Author + Date with harsh styling */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '4px solid #000000',
              paddingTop: '14px',
              borderRadius: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: 20,
                fontWeight: 900,
                color: '#000000',
                letterSpacing: '1px',
              }}
            >
              {meta.author}
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 16,
                fontWeight: 700,
                color: '#ff0000',
              }}
            >
              {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC',
              })}
            </div>
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
