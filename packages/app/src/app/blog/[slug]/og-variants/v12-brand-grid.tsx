/**
 * V12: Brand Grid — Full tiled circuit grid matching the sitewide OG image style.
 * Teal trace tiles (#2A6B6B–#3A7A7A) with gold accent tiles (#F7B041).
 * Content over gradient overlay. Closest recreation of the sharecard aesthetic.
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

// 10x6 grid, each cell is a tile type:
// 0 = empty, 1 = teal horizontal traces, 2 = teal wavy, 3 = teal angular, 4 = gold trace, 5 = blue trace
const GRID: number[][] = [
  [1, 2, 0, 3, 1, 0, 2, 4, 1, 3],
  [3, 0, 1, 2, 0, 3, 0, 1, 0, 2],
  [0, 1, 4, 0, 1, 0, 3, 0, 2, 0],
  [2, 0, 0, 3, 0, 1, 0, 0, 5, 1],
  [0, 3, 1, 0, 5, 0, 2, 1, 0, 3],
  [1, 0, 2, 0, 1, 3, 4, 0, 1, 2],
];

const CELL_W = 120;
const CELL_H = 105;

function tileColor(type: number): string {
  if (type === 4) return `${GOLD}30`;
  if (type === 5) return `${BLUE}25`;
  if (type === 0) return `${TEAL}08`;
  return `${TEAL}${15 + type * 5}`;
}

function innerColor(type: number): string {
  if (type === 4) return `${GOLD}20`;
  if (type === 5) return `${BLUE}18`;
  return `${TEAL}${10 + type * 4}`;
}

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

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
        padding: 60,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Grid tiles */}
      {GRID.flatMap((row, ry) =>
        row.map((type, cx) => (
          <div
            key={`${ry}-${cx}`}
            style={{
              position: 'absolute',
              left: cx * CELL_W,
              top: ry * CELL_H,
              width: CELL_W,
              height: CELL_H,
              border: `1px solid ${tileColor(type)}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {type > 0 && (
              <div
                style={{
                  width: CELL_W * 0.65,
                  height: CELL_H * 0.55,
                  border: `1.5px solid ${innerColor(type)}`,
                  borderRadius: 3,
                  display: 'flex',
                }}
              />
            )}
          </div>
        )),
      )}

      {/* Gradient overlay for readability */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          background: `linear-gradient(135deg, ${BG}f0 0%, ${BG}d8 40%, ${BG}f0 100%)`,
          display: 'flex',
        }}
      />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
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
            fontSize: 28,
            color: '#C9CACB',
            lineHeight: 1.4,
            maxHeight: 80,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 120 ? meta.excerpt.slice(0, 120) + '…' : meta.excerpt}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 20,
          fontSize: 24,
          color: '#B4B9BC',
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
                fontSize: 20,
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
