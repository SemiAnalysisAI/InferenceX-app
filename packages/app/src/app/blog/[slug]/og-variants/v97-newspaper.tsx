/**
 * V97: Newspaper — Classic newspaper headline layout with masthead, dateline, and column hint.
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
        backgroundColor: '#faf6f0',
        color: '#1a1a1a',
        padding: '40px 60px',
        fontFamily: 'serif',
        position: 'relative',
      }}
    >
      {/* Top rule */}
      <div style={{ display: 'flex', width: '100%', borderTop: '3px solid #1a1a1a' }} />

      {/* Masthead */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          width: '100%',
          padding: '12px 0',
        }}
      >
        <span
          style={{
            fontSize: 36,
            fontWeight: 900,
            letterSpacing: '0.08em',
          }}
        >
          THE INFERENCEX TIMES
        </span>
      </div>

      {/* Bottom rule under masthead */}
      <div style={{ display: 'flex', width: '100%', borderTop: '1px solid #1a1a1a' }} />

      {/* Date and edition line */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          width: '100%',
          padding: '6px 0',
          borderBottom: '1px solid #1a1a1a',
        }}
      >
        <span style={{ fontSize: 12, color: '#555555' }}>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
        <span style={{ fontSize: 12, color: '#555555' }}>{meta.readingTime} min read</span>
      </div>

      {/* Headline */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          width: '100%',
          padding: '28px 20px 16px',
        }}
      >
        <span
          style={{
            fontSize: titleSize + 8,
            fontWeight: 900,
            textAlign: 'center',
            lineHeight: 1.1,
            maxWidth: '95%',
          }}
        >
          {meta.title}
        </span>
      </div>

      {/* Two-column area with vertical divider */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          width: '100%',
          position: 'relative',
        }}
      >
        {/* Left column — dateline + excerpt */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '55%',
            paddingRight: '30px',
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1.6, color: '#333333' }}>
            SAN FRANCISCO,{' '}
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}{' '}
            &mdash;{' '}
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </span>
        </div>

        {/* Vertical divider */}
        <div
          style={{
            display: 'flex',
            width: '1px',
            backgroundColor: '#999999',
            position: 'absolute',
            left: '57%',
            top: '0',
            bottom: '0',
          }}
        />

        {/* Right column — author and tags */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '40%',
            paddingLeft: '35px',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, marginBottom: '8px' }}>
            By {meta.author}
          </span>
          <span style={{ fontSize: 12, color: '#666666' }}>
            {meta.tags ? meta.tags.join(' | ') : ''}
          </span>
        </div>
      </div>

      {/* Logo bottom-left */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: '20px',
          left: '30px',
        }}
      >
        <img src={logoSrc} width={24} height={24} />
      </div>
    </div>,
    size,
  );
}
