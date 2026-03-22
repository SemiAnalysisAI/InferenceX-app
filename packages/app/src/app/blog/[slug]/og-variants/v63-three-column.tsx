/**
 * V63: Three Column — Thin left column (60px) with decorative vertical line and dots,
 * wide center column with title/excerpt, thin right column (60px) with decorative elements.
 * Creates a columnar page feel.
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
        backgroundColor: '#0c0c0e',
        color: '#fafafa',
        overflow: 'hidden',
      }}
    >
      {/* Left decorative column */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: 60,
          height: '100%',
          position: 'relative',
          borderRight: '1px solid #1e1e24',
        }}
      >
        {/* Vertical line */}
        <div
          style={{
            position: 'absolute',
            left: 30,
            top: 0,
            width: 1,
            height: '100%',
            backgroundColor: '#2dd4bf18',
            display: 'flex',
          }}
        />
        {/* Decorative dots */}
        {[80, 180, 280, 380, 480].map((top) => (
          <div
            key={`ld${top}`}
            style={{
              position: 'absolute',
              left: 26,
              top,
              width: 8,
              height: 8,
              backgroundColor: top === 280 ? '#F7B04150' : '#2dd4bf25',
              borderRadius: 4,
              display: 'flex',
            }}
          />
        ))}
      </div>

      {/* Center content column */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 1,
          padding: '50px 48px',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} height={32} />
        </div>

        {/* Title + excerpt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 700,
              lineHeight: 1.2,
              color: '#ffffff',
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 26,
              color: '#a1a1aa',
              lineHeight: 1.4,
              maxHeight: 76,
              overflow: 'hidden',
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 22, color: '#9090a0' }}
        >
          <span style={{ fontWeight: 600, color: '#d0d0d8' }}>{meta.author}</span>
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

      {/* Right decorative column */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: 60,
          height: '100%',
          position: 'relative',
          borderLeft: '1px solid #1e1e24',
        }}
      >
        {/* Vertical line */}
        <div
          style={{
            position: 'absolute',
            left: 30,
            top: 0,
            width: 1,
            height: '100%',
            backgroundColor: '#2dd4bf18',
            display: 'flex',
          }}
        />
        {/* Decorative small squares */}
        {[120, 250, 400, 530].map((top) => (
          <div
            key={`rs${top}`}
            style={{
              position: 'absolute',
              left: 24,
              top,
              width: 12,
              height: 12,
              border: `1px solid ${top === 400 ? '#F7B04140' : '#2dd4bf20'}`,
              borderRadius: 2,
              display: 'flex',
            }}
          />
        ))}
        {/* Gold accent line segment */}
        <div
          style={{
            position: 'absolute',
            left: 30,
            top: 200,
            width: 1,
            height: 60,
            backgroundColor: '#F7B04130',
            display: 'flex',
          }}
        />
      </div>
    </div>,
    size,
  );
}
