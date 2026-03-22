/**
 * V117: Timeline — horizontal gold line across the middle with date marker dot. Title above, author and excerpt below.
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
        backgroundColor: '#0c0c14',
        color: '#ffffff',
        position: 'relative',
      }}
    >
      {/* Top section: Logo + Title */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '40px 56px 0 56px',
          height: '280px',
          justifyContent: 'space-between',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} width={40} height={40} />
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

        {/* Title */}
        <div
          style={{
            display: 'flex',
            fontSize: titleSize,
            fontWeight: 800,
            lineHeight: 1.15,
            color: '#ffffff',
            paddingBottom: '24px',
          }}
        >
          {meta.title}
        </div>
      </div>

      {/* Timeline bar */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          position: 'relative',
          height: '40px',
          padding: '0 56px',
        }}
      >
        {/* Line */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '2px',
            backgroundColor: '#c8a84e',
          }}
        />
        {/* Dot on the line */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            left: '40%',
            top: '50%',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            backgroundColor: '#c8a84e',
            marginTop: '-8px',
          }}
        />
        {/* Date label near the dot */}
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            left: '40%',
            top: '-20px',
            marginLeft: '24px',
            fontSize: 16,
            fontWeight: 600,
            color: '#c8a84e',
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

      {/* Bottom section: Excerpt + Author */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '24px 56px 40px 56px',
          flex: 1,
          justifyContent: 'space-between',
        }}
      >
        {/* Excerpt */}
        <div
          style={{
            display: 'flex',
            fontSize: 20,
            color: '#9ca3af',
            lineHeight: 1.5,
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
        </div>

        {/* Author + reading time */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', fontSize: 18, color: '#d1d5db' }}>{meta.author}</div>
          <div style={{ display: 'flex', fontSize: 16, color: '#6b7280' }}>
            {meta.readingTime} min read
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
