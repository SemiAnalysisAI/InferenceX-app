/**
 * V13: Brand Left Panel — Left 1/4 is a dense circuit panel with SemiAnalysis brand colors.
 * Blue accent bar on border. Gold nodes at intersections. Right 3/4 is content.
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
const PANEL_BG = '#0F1214';

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 56 : meta.title.length > 40 ? 64 : 72;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: BG,
        color: '#EAEBEC',
        overflow: 'hidden',
      }}
    >
      {/* Left panel */}
      <div
        style={{
          display: 'flex',
          width: 280,
          height: '100%',
          backgroundColor: PANEL_BG,
          position: 'relative',
        }}
      >
        {/* Grid of circuit cells */}
        {Array.from({ length: 18 }).map((_, i) => {
          const row = Math.floor(i / 3);
          const col = i % 3;
          const isGold = i === 4 || i === 10 || i === 16;
          const isBlue = i === 7 || i === 13;
          const color = isGold ? `${GOLD}40` : isBlue ? `${BLUE}30` : `${TEAL}25`;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: 12 + col * 90,
                top: 10 + row * 105,
                width: 78,
                height: 92,
                border: `1.5px solid ${color}`,
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {i % 3 === 0 && (
                <div
                  style={{
                    width: 34,
                    height: 34,
                    border: `1px solid ${isGold ? `${GOLD}25` : `${TEAL}15`}`,
                    borderRadius: 2,
                    display: 'flex',
                  }}
                />
              )}
            </div>
          );
        })}
        {/* Vertical traces */}
        <div
          style={{
            position: 'absolute',
            left: 51,
            top: 0,
            width: 1,
            height: '100%',
            backgroundColor: `${TEAL}12`,
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 141,
            top: 0,
            width: 1,
            height: '100%',
            backgroundColor: `${TEAL}12`,
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 231,
            top: 0,
            width: 1,
            height: '100%',
            backgroundColor: `${TEAL}12`,
            display: 'flex',
          }}
        />
        {/* Horizontal traces */}
        {[105, 210, 315, 420, 525].map((y) => (
          <div
            key={y}
            style={{
              position: 'absolute',
              left: 0,
              top: y,
              width: 280,
              height: 1,
              backgroundColor: `${TEAL}10`,
              display: 'flex',
            }}
          />
        ))}
        {/* Gold nodes at key intersections */}
        <div
          style={{
            position: 'absolute',
            left: 48,
            top: 102,
            width: 7,
            height: 7,
            backgroundColor: GOLD,
            borderRadius: 4,
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 138,
            top: 312,
            width: 7,
            height: 7,
            backgroundColor: GOLD,
            borderRadius: 4,
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 228,
            top: 522,
            width: 7,
            height: 7,
            backgroundColor: GOLD,
            borderRadius: 4,
            display: 'flex',
          }}
        />
        {/* Blue accent bar */}
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            width: 3,
            height: '100%',
            backgroundColor: BLUE,
            display: 'flex',
          }}
        />
      </div>

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 1,
          padding: '48px 55px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
          <img src={logoSrc} height={96} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
            {meta.excerpt.length > 110 ? meta.excerpt.slice(0, 110) + '…' : meta.excerpt}
          </div>
        </div>

        <div
          style={{ display: 'flex', gap: 20, fontSize: 24, color: '#B4B9BC', alignItems: 'center' }}
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
            meta.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                style={{
                  backgroundColor: `${GOLD}18`,
                  border: `1px solid ${GOLD}30`,
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
    </div>,
    size,
  );
}
