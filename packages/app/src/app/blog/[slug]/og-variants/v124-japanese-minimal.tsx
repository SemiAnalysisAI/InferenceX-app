/**
 * V124: Minimal Japanese — extreme negative darkspace with small text in the corner and a single thin accent line. Zen, meditative.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#080808',
        color: '#e5e5e5',
        position: 'relative',
      }}
    >
      {/* Single thin vertical accent line */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: '80px',
          top: '60px',
          width: '1px',
          height: '510px',
          backgroundColor: '#c8a84e',
          opacity: 0.3,
        }}
      />

      {/* Logo — small, top right */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: '40px',
          right: '48px',
          alignItems: 'center',
        }}
      >
        <img src={logoSrc} width={24} height={24} />
        <div
          style={{
            display: 'flex',
            marginLeft: '8px',
            fontSize: 14,
            fontWeight: 600,
            color: '#c8a84e',
            opacity: 0.5,
          }}
        >
          InferenceX
        </div>
      </div>

      {/* Content cluster — bottom left, small text */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          bottom: '60px',
          left: '110px',
          gap: '14px',
          maxWidth: '600px',
        }}
      >
        {/* Title — intentionally small */}
        <div
          style={{
            display: 'flex',
            fontSize: 28,
            fontWeight: 600,
            lineHeight: 1.35,
            color: '#e5e5e5',
          }}
        >
          {meta.title}
        </div>

        {/* Excerpt — very small */}
        <div
          style={{
            display: 'flex',
            fontSize: 15,
            color: '#737373',
            lineHeight: 1.5,
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
        </div>

        {/* Author + Date — tiny */}
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 13,
              color: '#525252',
            }}
          >
            {meta.author}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 13,
              color: '#404040',
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
    </div>,
    size,
  );
}
