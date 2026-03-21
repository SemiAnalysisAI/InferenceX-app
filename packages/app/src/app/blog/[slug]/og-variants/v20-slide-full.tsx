/**
 * V20: Slide Full Brand — The most complete brand expression. Combines all
 * SemiAnalysis presentation elements: gold title bar top, charcoal content,
 * circuit pattern right margin, gold bottom bar, proper typography hierarchy.
 * This is the "if SemiAnalysis designed a blog OG card" version.
 */
import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const GOLD = '#F7B041';
const BLUE = '#0B86D1';
const CHARCOAL = '#454646';
const DARK = '#2A2B2C';

export function renderOgImage(meta: BlogPostMeta) {
  const titleSize = meta.title.length > 60 ? 36 : meta.title.length > 40 ? 44 : 52;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: CHARCOAL,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Gold top bar with brand */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 56,
          backgroundColor: GOLD,
          alignItems: 'center',
          padding: '0 28px',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: BLUE }}>semi</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#444647' }}>analysis</span>
          <span style={{ fontSize: 14, color: '#5D5E5F', marginLeft: 12 }}>InferenceX Blog</span>
        </div>
        <div
          style={{ display: 'flex', gap: 12, fontSize: 13, color: '#5D5E5F', alignItems: 'center' }}
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
        </div>
      </div>

      {/* Main content area */}
      <div style={{ display: 'flex', flex: 1 }}>
        {/* Content — left portion */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            flex: 1,
            padding: '40px 50px',
            gap: 18,
          }}
        >
          {/* Gold title */}
          <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.15, color: GOLD }}>
            {meta.title}
          </div>

          {/* White subtitle */}
          <div
            style={{
              fontSize: 21,
              color: '#FFFFFF',
              lineHeight: 1.45,
              maxHeight: 92,
              overflow: 'hidden',
            }}
          >
            {meta.excerpt.length > 160 ? meta.excerpt.slice(0, 160) + '…' : meta.excerpt}
          </div>

          {/* Tags + reading time */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 4 }}>
            <span style={{ fontSize: 15, color: '#BFBFBF' }}>{meta.readingTime} min read</span>
            {meta.tags &&
              meta.tags.slice(0, 3).map((tag, i) => (
                <span key={tag} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 8,
                      backgroundColor: i === 0 ? GOLD : i === 1 ? BLUE : '#76B041',
                      display: 'flex',
                    }}
                  />
                  <span style={{ fontSize: 13, color: '#BFBFBF' }}>{tag}</span>
                </span>
              ))}
          </div>
        </div>

        {/* Right circuit panel */}
        <div
          style={{
            display: 'flex',
            width: 280,
            height: '100%',
            backgroundColor: DARK,
            position: 'relative',
            borderLeft: `2px solid ${GOLD}30`,
          }}
        >
          {/* Vertical traces */}
          {[45, 115, 185, 255].map((x) => (
            <div
              key={`v${x}`}
              style={{
                position: 'absolute',
                left: x,
                top: 0,
                width: 1,
                height: '100%',
                backgroundColor: '#55565730',
                display: 'flex',
              }}
            />
          ))}
          {/* Horizontal traces */}
          {[45, 115, 185, 255, 325, 395, 465].map((y) => (
            <div
              key={`h${y}`}
              style={{
                position: 'absolute',
                left: 0,
                top: y,
                width: '100%',
                height: 1,
                backgroundColor: '#55565725',
                display: 'flex',
              }}
            />
          ))}
          {/* Circuit nodes */}
          {[
            { x: 39, y: 39, s: 14, gold: false },
            { x: 109, y: 109, s: 12, gold: true },
            { x: 179, y: 39, s: 10, gold: false },
            { x: 249, y: 179, s: 14, gold: false },
            { x: 39, y: 179, s: 16, gold: false },
            { x: 109, y: 319, s: 12, gold: true },
            { x: 179, y: 249, s: 14, gold: false },
            { x: 249, y: 389, s: 10, gold: false },
            { x: 39, y: 319, s: 12, gold: false },
            { x: 179, y: 389, s: 16, gold: true },
            { x: 249, y: 109, s: 10, gold: false },
            { x: 109, y: 459, s: 14, gold: false },
          ].map((n, i) => (
            <div
              key={`cn${i}`}
              style={{
                position: 'absolute',
                left: n.x,
                top: n.y,
                width: n.s,
                height: n.s,
                border: `1.5px solid ${n.gold ? `${GOLD}50` : '#55565740'}`,
                borderRadius: 2,
                display: 'flex',
              }}
            />
          ))}
          {/* Gold junction dots */}
          <div
            style={{
              position: 'absolute',
              left: 112,
              top: 112,
              width: 6,
              height: 6,
              backgroundColor: `${GOLD}90`,
              borderRadius: 6,
              display: 'flex',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 112,
              top: 322,
              width: 6,
              height: 6,
              backgroundColor: `${GOLD}70`,
              borderRadius: 6,
              display: 'flex',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 182,
              top: 392,
              width: 8,
              height: 8,
              backgroundColor: `${GOLD}80`,
              borderRadius: 8,
              display: 'flex',
            }}
          />
          {/* Right-angle bends */}
          <div
            style={{
              position: 'absolute',
              left: 45,
              top: 46,
              width: 70,
              height: 2,
              backgroundColor: '#55565735',
              display: 'flex',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 115,
              top: 46,
              width: 2,
              height: 69,
              backgroundColor: '#55565735',
              display: 'flex',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 115,
              top: 326,
              width: 70,
              height: 2,
              backgroundColor: '#55565730',
              display: 'flex',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 185,
              top: 256,
              width: 2,
              height: 72,
              backgroundColor: '#55565730',
              display: 'flex',
            }}
          />
        </div>
      </div>

      {/* Gold bottom bar */}
      <div style={{ display: 'flex', width: '100%', height: 6, backgroundColor: GOLD }} />
    </div>,
    size,
  );
}
