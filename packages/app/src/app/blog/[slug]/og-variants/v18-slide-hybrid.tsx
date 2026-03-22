/**
 * V18: Slide Hybrid — Combines title slide (gold) and content slide (charcoal).
 * Left 35% is gold with circuit pattern, right 65% is dark with content.
 * The "two-tone presentation" look.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const GOLD = '#F7B041';
const CHARCOAL = '#454646';
const DARK = '#2A2B2C';

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 54 : 62;

  return new ImageResponse(
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Left panel — gold with circuit pattern */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: 400,
          height: '100%',
          backgroundColor: GOLD,
          position: 'relative',
          justifyContent: 'space-between',
          padding: '50px 40px',
        }}
      >
        {/* Circuit overlay on bottom half */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            width: 400,
            height: 320,
            backgroundColor: DARK,
            display: 'flex',
          }}
        >
          {/* Vertical traces */}
          {[50, 130, 210, 290, 370].map((x) => (
            <div
              key={`v${x}`}
              style={{
                position: 'absolute',
                left: x,
                top: 0,
                width: 1,
                height: '100%',
                backgroundColor: '#55565738',
                display: 'flex',
              }}
            />
          ))}
          {/* Horizontal traces */}
          {[50, 130, 210, 290].map((y) => (
            <div
              key={`h${y}`}
              style={{
                position: 'absolute',
                left: 0,
                top: y,
                width: '100%',
                height: 1,
                backgroundColor: '#55565730',
                display: 'flex',
              }}
            />
          ))}
          {/* Circuit nodes */}
          {[
            { x: 44, y: 44, s: 14 },
            { x: 124, y: 124, s: 12 },
            { x: 204, y: 44, s: 10 },
            { x: 284, y: 204, s: 14 },
            { x: 364, y: 124, s: 12 },
            { x: 124, y: 284, s: 10 },
            { x: 284, y: 44, s: 12 },
            { x: 44, y: 204, s: 16 },
            { x: 364, y: 284, s: 14 },
          ].map((n, i) => (
            <div
              key={`cn${i}`}
              style={{
                position: 'absolute',
                left: n.x,
                top: n.y,
                width: n.s,
                height: n.s,
                border: `1.5px solid #55565745`,
                borderRadius: 2,
                display: 'flex',
              }}
            />
          ))}
          {/* Gold nodes */}
          <div
            style={{
              position: 'absolute',
              left: 127,
              top: 127,
              width: 6,
              height: 6,
              backgroundColor: `${GOLD}80`,
              borderRadius: 6,
              display: 'flex',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 287,
              top: 207,
              width: 8,
              height: 8,
              backgroundColor: `${GOLD}70`,
              borderRadius: 8,
              display: 'flex',
            }}
          />
        </div>

        {/* Brand logo on gold area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, zIndex: 1 }}>
          <img src={logoSrc} height={32} />
        </div>

        {/* Date + meta on gold area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, zIndex: 1 }}>
          <span style={{ fontSize: 24, color: '#5D5E5F' }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ fontSize: 24, color: '#6D6E6F' }}>{meta.readingTime} min read</span>
        </div>
      </div>

      {/* Right panel — charcoal with content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          backgroundColor: CHARCOAL,
          justifyContent: 'center',
          padding: '50px 55px',
          gap: 20,
        }}
      >
        <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.15, color: '#FFFFFF' }}>
          {meta.title}
        </div>
        <div
          style={{
            fontSize: 28,
            color: '#BFBFBF',
            lineHeight: 1.45,
            maxHeight: 120,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '…' : meta.excerpt}
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 24, color: '#999EA4' }}>{meta.author}</span>
          {meta.tags &&
            meta.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                style={{
                  backgroundColor: `${GOLD}20`,
                  border: `1px solid ${GOLD}35`,
                  color: GOLD,
                  padding: '4px 14px',
                  borderRadius: 9999,
                  fontSize: 20,
                }}
              >
                {tag}
              </span>
            ))}
        </div>
      </div>

      {/* Gold accent line at the split */}
      <div
        style={{
          position: 'absolute',
          left: 400,
          top: 0,
          width: 3,
          height: '100%',
          backgroundColor: GOLD,
          display: 'flex',
        }}
      />
    </div>,
    size,
  );
}
