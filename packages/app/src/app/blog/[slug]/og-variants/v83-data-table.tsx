/**
 * V83: Data Table — Spreadsheet/table layout with header row, main content row,
 * and footer cells divided by grid lines throughout.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 44 : meta.title.length > 40 ? 52 : 58;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0c0c10',
        color: '#e4e4e7',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          height: 56,
          borderBottom: '1px solid #27272a',
          backgroundColor: '#18181b',
        }}
      >
        {/* Row number column */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 60,
            borderRight: '1px solid #27272a',
            fontSize: 13,
            color: '#52525b',
          }}
        >
          #
        </div>
        {/* Column A: Title */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flex: 1,
            padding: '0 20px',
            borderRight: '1px solid #27272a',
            fontSize: 13,
            color: '#71717a',
            letterSpacing: 1,
          }}
        >
          TITLE
        </div>
        {/* Column B: Status */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            width: 140,
            padding: '0 16px',
            borderRight: '1px solid #27272a',
            fontSize: 13,
            color: '#71717a',
            letterSpacing: 1,
          }}
        >
          STATUS
        </div>
        {/* Column C: Reading Time */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            width: 120,
            padding: '0 16px',
            fontSize: 13,
            color: '#71717a',
            letterSpacing: 1,
          }}
        >
          READ TIME
        </div>
      </div>

      {/* Logo row */}
      <div
        style={{
          display: 'flex',
          height: 60,
          borderBottom: '1px solid #27272a',
          backgroundColor: '#141417',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 60,
            borderRight: '1px solid #27272a',
            fontSize: 14,
            color: '#3f3f46',
          }}
        >
          0
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flex: 1,
            padding: '0 20px',
            borderRight: '1px solid #27272a',
          }}
        >
          <img src={logoSrc} height={24} />
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            width: 140,
            padding: '0 16px',
            borderRight: '1px solid #27272a',
            fontSize: 14,
            color: '#a1a1aa',
          }}
        >
          Blog
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            width: 120,
            padding: '0 16px',
            fontSize: 14,
            color: '#a1a1aa',
          }}
        >
          -
        </div>
      </div>

      {/* Main content row — title + excerpt */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          borderBottom: '1px solid #27272a',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            width: 60,
            borderRight: '1px solid #27272a',
            fontSize: 14,
            color: '#3f3f46',
            paddingTop: 30,
          }}
        >
          1
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '30px 24px',
            borderRight: '1px solid #27272a',
            justifyContent: 'center',
            gap: 16,
          }}
        >
          <div
            style={{
              fontSize: titleSize,
              fontWeight: 700,
              lineHeight: 1.2,
              color: '#fafafa',
              display: 'flex',
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              fontSize: 24,
              color: '#71717a',
              lineHeight: 1.4,
              maxHeight: 70,
              overflow: 'hidden',
              display: 'flex',
            }}
          >
            {meta.excerpt.length > 130 ? meta.excerpt.slice(0, 130) + '...' : meta.excerpt}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            width: 140,
            padding: '0 16px',
            borderRight: '1px solid #27272a',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 14,
              color: '#22c55e',
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 9999,
                backgroundColor: '#22c55e',
                display: 'flex',
              }}
            />
            Published
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 120,
            fontSize: 20,
            fontWeight: 700,
            color: '#a78bfa',
          }}
        >
          {meta.readingTime} min
        </div>
      </div>

      {/* Footer row — author & date in cells */}
      <div
        style={{
          display: 'flex',
          height: 64,
          backgroundColor: '#18181b',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 60,
            borderRight: '1px solid #27272a',
            fontSize: 14,
            color: '#3f3f46',
          }}
        >
          2
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0 20px',
            borderRight: '1px solid #27272a',
            flex: 1,
          }}
        >
          <div style={{ display: 'flex', gap: 12, fontSize: 18 }}>
            <span style={{ color: '#71717a' }}>Author:</span>
            <span style={{ color: '#e4e4e7', fontWeight: 600 }}>{meta.author}</span>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            width: 260,
          }}
        >
          <div style={{ display: 'flex', gap: 12, fontSize: 18 }}>
            <span style={{ color: '#71717a' }}>Date:</span>
            <span style={{ color: '#e4e4e7' }}>
              {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC',
              })}
            </span>
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
