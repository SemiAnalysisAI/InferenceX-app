/**
 * V102: Trading Card — Bordered card with name bar, stats section, and holographic-hint border.
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
        backgroundColor: '#1c1c2e',
        padding: '30px',
        fontFamily: 'sans-serif',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Holographic-hint outer border */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          borderTop: '3px solid #ff6b6b',
          borderRight: '3px solid #4ecdc4',
          borderBottom: '3px solid #45b7d1',
          borderLeft: '3px solid #f7dc6f',
          borderRadius: '16px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Inner card */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            backgroundColor: '#242442',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          {/* Name bar at top */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              backgroundColor: '#3a3a6a',
              padding: '14px 24px',
            }}
          >
            <img src={logoSrc} width={22} height={22} />
            <span
              style={{
                fontSize: 14,
                color: '#aaaacc',
                marginLeft: '10px',
                letterSpacing: '0.15em',
              }}
            >
              INFERENCEX
            </span>
            <div style={{ display: 'flex', flex: 1 }} />
            <span style={{ fontSize: 12, color: '#8888aa' }}>
              {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC',
              })}
            </span>
          </div>

          {/* Main content area */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              padding: '30px 32px',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: titleSize - 4,
                fontWeight: 800,
                color: '#ffffff',
                textAlign: 'center',
                lineHeight: 1.15,
                maxWidth: '90%',
              }}
            >
              {meta.title}
            </span>
            <span
              style={{
                fontSize: 16,
                color: '#9999bb',
                marginTop: '16px',
                textAlign: 'center',
                maxWidth: '80%',
                lineHeight: 1.4,
              }}
            >
              {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
            </span>
          </div>

          {/* Stats section at bottom */}
          <div
            style={{
              display: 'flex',
              width: '100%',
              backgroundColor: '#2e2e52',
              padding: '14px 24px',
              borderTop: '1px solid #4a4a7a',
            }}
          >
            {/* Author stat */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 10, color: '#7777aa', letterSpacing: '0.1em' }}>AUTHOR</span>
              <span style={{ fontSize: 14, color: '#ddddee', fontWeight: 600, marginTop: '2px' }}>
                {meta.author}
              </span>
            </div>

            {/* Reading time stat */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                alignItems: 'center',
                borderLeft: '1px solid #4a4a7a',
                borderRight: '1px solid #4a4a7a',
              }}
            >
              <span style={{ fontSize: 10, color: '#7777aa', letterSpacing: '0.1em' }}>
                READ TIME
              </span>
              <span style={{ fontSize: 14, color: '#ddddee', fontWeight: 600, marginTop: '2px' }}>
                {meta.readingTime} MIN
              </span>
            </div>

            {/* Tags stat */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 10, color: '#7777aa', letterSpacing: '0.1em' }}>TAGS</span>
              <span style={{ fontSize: 12, color: '#ddddee', marginTop: '2px' }}>
                {meta.tags ? meta.tags.slice(0, 3).join(' \u00b7 ') : ''}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
