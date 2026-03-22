/**
 * V98: Book Cover — Timeless centered design with title, author, and publisher mark.
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
        backgroundColor: '#f5f0e8',
        color: '#2c2419',
        padding: '70px 100px',
        fontFamily: 'serif',
        position: 'relative',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Subtle outer border */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          border: '1px solid #c4b8a4',
          padding: '40px 60px',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative',
        }}
      >
        {/* Top spacer */}
        <div style={{ display: 'flex', flex: 1 }} />

        {/* Title */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            width: '100%',
          }}
        >
          <span
            style={{
              fontSize: titleSize,
              fontWeight: 700,
              textAlign: 'center',
              lineHeight: 1.15,
              maxWidth: '90%',
            }}
          >
            {meta.title}
          </span>
        </div>

        {/* Decorative line */}
        <div
          style={{
            display: 'flex',
            width: '80px',
            height: '1px',
            backgroundColor: '#8a7d6b',
            margin: '28px 0',
          }}
        />

        {/* Author */}
        <div style={{ display: 'flex' }}>
          <span
            style={{
              fontSize: 22,
              color: '#5c5040',
              letterSpacing: '0.12em',
            }}
          >
            {meta.author}
          </span>
        </div>

        {/* Bottom spacer */}
        <div style={{ display: 'flex', flex: 1 }} />

        {/* Publisher mark — logo at bottom center */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <img src={logoSrc} width={32} height={32} />
          <span
            style={{
              fontSize: 11,
              color: '#8a7d6b',
              marginTop: '6px',
              letterSpacing: '0.2em',
            }}
          >
            INFERENCEX
          </span>
        </div>
      </div>
    </div>,
    size,
  );
}
