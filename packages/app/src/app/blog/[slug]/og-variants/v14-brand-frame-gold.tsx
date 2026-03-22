/**
 * V14: Brand Frame Gold — Circuit frame around all edges with gold corner accents.
 * Logo in header. Full brand palette.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const GOLD = '#F7B041';
const BLUE = '#0B86D1';
const TEAL = '#3A7A7A';
const BG = '#131416';

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 56 : meta.title.length > 40 ? 64 : 72;

  // Top/bottom frame blocks
  const hBlocks = Array.from({ length: 14 }).map((_, i) => ({
    x: 8 + i * 85,
    w: 74,
    h: 42 + (i % 3) * 6,
    isGold: i === 3 || i === 10,
    isBlue: i === 7,
  }));

  // Left/right frame blocks
  const vBlocks = Array.from({ length: 5 }).map((_, i) => ({
    y: 60 + i * 108,
    w: 48 + (i % 2) * 8,
    h: 92,
    isGold: i === 1 || i === 4,
    isBlue: i === 3,
  }));

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        backgroundColor: BG,
        color: '#EAEBEC',
        padding: '75px 85px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top frame */}
      {hBlocks.map((b, i) => (
        <div
          key={`t${i}`}
          style={{
            position: 'absolute',
            left: b.x,
            top: 6 + (i % 2) * 4,
            width: b.w,
            height: b.h,
            border: `1.5px solid ${b.isGold ? `${GOLD}40` : b.isBlue ? `${BLUE}30` : `${TEAL}22`}`,
            borderRadius: 3,
            display: 'flex',
          }}
        />
      ))}
      {/* Bottom frame */}
      {hBlocks.map((b, i) => (
        <div
          key={`b${i}`}
          style={{
            position: 'absolute',
            left: b.x,
            bottom: 6 + (i % 2) * 4,
            width: b.w,
            height: b.h,
            border: `1.5px solid ${b.isGold ? `${GOLD}35` : b.isBlue ? `${BLUE}25` : `${TEAL}18`}`,
            borderRadius: 3,
            display: 'flex',
          }}
        />
      ))}
      {/* Left frame */}
      {vBlocks.map((b, i) => (
        <div
          key={`l${i}`}
          style={{
            position: 'absolute',
            left: 6 + (i % 2) * 4,
            top: b.y,
            width: b.w,
            height: b.h,
            border: `1.5px solid ${b.isGold ? `${GOLD}40` : b.isBlue ? `${BLUE}28` : `${TEAL}20`}`,
            borderRadius: 3,
            display: 'flex',
          }}
        />
      ))}
      {/* Right frame */}
      {vBlocks.map((b, i) => (
        <div
          key={`r${i}`}
          style={{
            position: 'absolute',
            right: 6 + (i % 2) * 4,
            top: b.y,
            width: b.w,
            height: b.h,
            border: `1.5px solid ${b.isGold ? `${GOLD}35` : b.isBlue ? `${BLUE}25` : `${TEAL}18`}`,
            borderRadius: 3,
            display: 'flex',
          }}
        />
      ))}

      {/* Gold corner L-brackets */}
      {/* Top-left */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 50,
          height: 3,
          backgroundColor: GOLD,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 3,
          height: 50,
          backgroundColor: GOLD,
          display: 'flex',
        }}
      />
      {/* Top-right */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: 50,
          height: 3,
          backgroundColor: GOLD,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: 3,
          height: 50,
          backgroundColor: GOLD,
          display: 'flex',
        }}
      />
      {/* Bottom-left */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: 50,
          height: 3,
          backgroundColor: GOLD,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: 3,
          height: 50,
          backgroundColor: GOLD,
          display: 'flex',
        }}
      />
      {/* Bottom-right */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 50,
          height: 3,
          backgroundColor: GOLD,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 3,
          height: 50,
          backgroundColor: GOLD,
          display: 'flex',
        }}
      />

      {/* Header with logo */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 14,
          zIndex: 1,
        }}
      >
        <img src={logoSrc} height={96} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, zIndex: 1 }}>
        <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.2, color: '#FFFFFF' }}>
          {meta.title}
        </div>
        <div
          style={{
            fontSize: 42,
            color: '#C9CACB',
            lineHeight: 1.4,
            maxHeight: 60,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 100 ? meta.excerpt.slice(0, 100) + '…' : meta.excerpt}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 20,
          fontSize: 36,
          color: '#d4d4d8',
          alignItems: 'center',
          zIndex: 1,
        }}
      >
        <span>{meta.author}</span>
        <span style={{ color: `${GOLD}60` }}>·</span>
        <span>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
        <span style={{ color: `${GOLD}60` }}>·</span>
        <span>{meta.readingTime} min read</span>
        {meta.tags &&
          meta.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              style={{
                backgroundColor: `${GOLD}18`,
                border: `1px solid ${GOLD}30`,
                color: GOLD,
                padding: '4px 16px',
                borderRadius: 9999,
                fontSize: 30,
              }}
            >
              {tag}
            </span>
          ))}
      </div>
    </div>,
    size,
  );
}
