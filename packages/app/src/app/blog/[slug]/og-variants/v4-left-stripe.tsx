/**
 * V4: Left Stripe — Bold teal/gold vertical stripe on the left with circuit nodes.
 * Content right-aligned. The stripe echoes the header's left-pattern mask.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 56 : meta.title.length > 40 ? 64 : 72;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: '#0c0c0e',
        color: '#fafafa',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Left stripe with circuit motif */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: 200,
          height: '100%',
          backgroundColor: '#0f1f1d',
          position: 'relative',
        }}
      >
        {/* Vertical trace lines */}
        <div
          style={{
            position: 'absolute',
            left: 40,
            top: 0,
            width: 1,
            height: '100%',
            backgroundColor: '#2dd4bf20',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 100,
            top: 0,
            width: 1,
            height: '100%',
            backgroundColor: '#2dd4bf15',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 160,
            top: 0,
            width: 1,
            height: '100%',
            backgroundColor: '#2dd4bf10',
            display: 'flex',
          }}
        />

        {/* Horizontal traces */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 80,
            width: 200,
            height: 1,
            backgroundColor: '#2dd4bf20',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 200,
            width: 200,
            height: 1,
            backgroundColor: '#2dd4bf15',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 350,
            width: 200,
            height: 1,
            backgroundColor: '#2dd4bf20',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 500,
            width: 200,
            height: 1,
            backgroundColor: '#2dd4bf15',
            display: 'flex',
          }}
        />

        {/* Circuit nodes (squares at intersections) */}
        <div
          style={{
            position: 'absolute',
            left: 34,
            top: 74,
            width: 12,
            height: 12,
            backgroundColor: '#2dd4bf40',
            borderRadius: 2,
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 94,
            top: 194,
            width: 12,
            height: 12,
            backgroundColor: '#eab30860',
            borderRadius: 2,
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 154,
            top: 344,
            width: 12,
            height: 12,
            backgroundColor: '#2dd4bf40',
            borderRadius: 2,
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 34,
            top: 494,
            width: 12,
            height: 12,
            backgroundColor: '#eab30860',
            borderRadius: 2,
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 94,
            top: 74,
            width: 12,
            height: 12,
            backgroundColor: '#2dd4bf25',
            borderRadius: 2,
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 154,
            top: 194,
            width: 12,
            height: 12,
            backgroundColor: '#2dd4bf30',
            borderRadius: 2,
            display: 'flex',
          }}
        />

        {/* Gold accent bar */}
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 150,
            width: 4,
            height: 330,
            backgroundColor: '#eab308',
            display: 'flex',
          }}
        />
      </div>

      {/* Content area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 1,
          padding: '50px 60px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <img src={logoSrc} height={96} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.2 }}>{meta.title}</div>
          <div
            style={{
              fontSize: 42,
              color: '#d4d4d8',
              lineHeight: 1.4,
              maxHeight: 60,
              overflow: 'hidden',
            }}
          >
            {meta.excerpt.length > 100 ? meta.excerpt.slice(0, 100) + '...' : meta.excerpt}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 24, fontSize: 36, color: '#d4d4d8' }}>
          <span>{meta.author}</span>
          <span>·</span>
          <span>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span>·</span>
          <span>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
