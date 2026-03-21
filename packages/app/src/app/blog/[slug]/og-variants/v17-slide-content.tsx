/**
 * V17: Slide Content — Matches the SemiAnalysis GSA content slide layout.
 * Dark charcoal (#454646) background, white title at top, gold bottom bar,
 * small logo in footer. The "data slide" look.
 */
import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const GOLD = '#F7B041';
const BLUE = '#0B86D1';
const CHARCOAL = '#454646';

export function renderOgImage(meta: BlogPostMeta) {
  const titleSize = meta.title.length > 60 ? 38 : meta.title.length > 40 ? 46 : 54;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: CHARCOAL,
        color: '#FFFFFF',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Title bar area */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '40px 55px 0', gap: 8 }}>
        <div
          style={{
            fontSize: titleSize,
            fontWeight: 700,
            lineHeight: 1.15,
            textTransform: 'uppercase' as const,
            letterSpacing: -0.5,
          }}
        >
          {meta.title}
        </div>
        <div style={{ fontSize: 20, color: '#BFBFBF', fontStyle: 'italic' }}>
          {meta.excerpt.length > 120 ? meta.excerpt.slice(0, 120) + '…' : meta.excerpt}
        </div>
      </div>

      {/* Main content area — empty "chart area" with subtle grid */}
      <div style={{ display: 'flex', flex: 1, margin: '24px 55px', position: 'relative' }}>
        {/* Faint grid lines like a chart background */}
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={`hg${i}`}
            style={{
              position: 'absolute',
              left: 0,
              top: `${i * 25}%`,
              width: '100%',
              height: 1,
              backgroundColor: '#D9D9D915',
              display: 'flex',
            }}
          />
        ))}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div
            key={`vg${i}`}
            style={{
              position: 'absolute',
              left: `${i * 14.28}%`,
              top: 0,
              width: 1,
              height: '100%',
              backgroundColor: '#D9D9D910',
              display: 'flex',
            }}
          />
        ))}

        {/* "InferenceX Blog" watermark centered */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: 48, fontWeight: 800, color: '#FFFFFF08' }}>InferenceX</span>
        </div>

        {/* Tags as data-point-like elements */}
        {meta.tags && meta.tags.length > 0 && (
          <div
            style={{
              position: 'absolute',
              bottom: 20,
              left: 0,
              display: 'flex',
              gap: 16,
              alignItems: 'center',
            }}
          >
            {meta.tags.slice(0, 4).map((tag, i) => (
              <div key={tag} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 10,
                    backgroundColor:
                      i === 0 ? GOLD : i === 1 ? BLUE : i === 2 ? '#76B041' : '#FF6B6B',
                    display: 'flex',
                  }}
                />
                <span style={{ fontSize: 14, color: '#BFBFBF' }}>{tag}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gold bottom bar */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 44,
          backgroundColor: GOLD,
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
        }}
      >
        <div
          style={{ display: 'flex', gap: 16, fontSize: 13, color: CHARCOAL, alignItems: 'center' }}
        >
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: BLUE }}>semi</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: CHARCOAL }}>analysis</span>
          <span style={{ fontSize: 12, color: '#5D5E5F', marginLeft: 8 }}>| InferenceX Blog</span>
        </div>
      </div>
    </div>,
    size,
  );
}
