/**
 * V15: Brand Split — Horizontal split: top 60% is content on dark, bottom 40% is
 * a teal-tinted circuit field with the brand mark. Gold divider line between.
 * Most "presentation slide" feel.
 */
import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const GOLD = '#F7B041';
const BLUE = '#0B86D1';
const TEAL = '#3A7A7A';
const BG = '#131416';

export function renderOgImage(meta: BlogPostMeta) {
  const titleSize = meta.title.length > 60 ? 40 : meta.title.length > 40 ? 48 : 56;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: BG,
        color: '#EAEBEC',
        overflow: 'hidden',
      }}
    >
      {/* Top section — content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 1,
          padding: '48px 60px 24px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.2, color: '#FFFFFF' }}>
            {meta.title}
          </div>
          <div
            style={{
              fontSize: 22,
              color: '#C9CACB',
              lineHeight: 1.4,
              maxHeight: 62,
              overflow: 'hidden',
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '…' : meta.excerpt}
          </div>
        </div>

        <div
          style={{ display: 'flex', gap: 20, fontSize: 17, color: '#B4B9BC', alignItems: 'center' }}
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
                  padding: '3px 14px',
                  borderRadius: 9999,
                  fontSize: 13,
                }}
              >
                {tag}
              </span>
            ))}
        </div>
      </div>

      {/* Gold divider */}
      <div style={{ display: 'flex', width: '100%', height: 3, backgroundColor: GOLD }} />

      {/* Bottom section — circuit field with brand */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 200,
          backgroundColor: '#0F1214',
          position: 'relative',
        }}
      >
        {/* Circuit blocks */}
        {Array.from({ length: 24 }).map((_, i) => {
          const col = i % 12;
          const row = Math.floor(i / 12);
          const isGold = i === 3 || i === 9 || i === 18;
          const isBlue = i === 6 || i === 15 || i === 21;
          const color = isGold ? `${GOLD}30` : isBlue ? `${BLUE}22` : `${TEAL}18`;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: 8 + col * 100,
                top: 10 + row * 100,
                width: 88,
                height: 82,
                border: `1.5px solid ${color}`,
                borderRadius: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {i % 4 === 0 && (
                <div
                  style={{
                    width: 35,
                    height: 30,
                    border: `1px solid ${isGold ? `${GOLD}20` : `${TEAL}12`}`,
                    borderRadius: 2,
                    display: 'flex',
                  }}
                />
              )}
            </div>
          );
        })}

        {/* Horizontal trace */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 50,
            width: '100%',
            height: 1,
            backgroundColor: `${TEAL}10`,
            display: 'flex',
          }}
        />

        {/* Brand wordmark positioned right */}
        <div
          style={{
            position: 'absolute',
            right: 50,
            top: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            zIndex: 1,
          }}
        >
          <span style={{ color: BLUE, fontSize: 28, fontWeight: 800 }}>semi</span>
          <span style={{ color: GOLD, fontSize: 28, fontWeight: 800, marginLeft: -8 }}>
            analysis
          </span>
          <span style={{ color: '#4D5157', fontSize: 24, margin: '0 8px' }}>|</span>
          <span style={{ color: '#B4B9BC', fontSize: 22 }}>InferenceX Blog</span>
        </div>
      </div>
    </div>,
    size,
  );
}
