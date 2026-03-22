/**
 * V173: Linocut/Woodcut — Bold white shapes on dark background with thick borders, decorative leaf patterns, high contrast printmaking aesthetic.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;
  const formattedDate = new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

  // Leaf/branch patterns along edges — made from ellipses and small rectangles
  // Left edge leaves
  const leftLeaves = Array.from({ length: 8 }, (_, i) => ({
    top: 40 + i * 70,
    left: 15,
    width: 28,
    height: 14,
    rotation: i % 2 === 0 ? 0 : 1,
  }));

  // Right edge leaves
  const rightLeaves = Array.from({ length: 8 }, (_, i) => ({
    top: 40 + i * 70,
    left: 1157,
    width: 28,
    height: 14,
    rotation: i % 2 === 0 ? 1 : 0,
  }));

  // Top edge leaves
  const topLeaves = Array.from({ length: 12 }, (_, i) => ({
    top: 12,
    left: 80 + i * 90,
    width: 14,
    height: 28,
  }));

  // Bottom edge leaves
  const bottomLeaves = Array.from({ length: 12 }, (_, i) => ({
    top: 590,
    left: 80 + i * 90,
    width: 14,
    height: 28,
  }));

  // Branch/stem lines along edges
  const stems = [
    // Left vertical stem
    { top: 30, left: 28, width: 3, height: 570 },
    // Right vertical stem
    { top: 30, left: 1169, width: 3, height: 570 },
    // Top horizontal stem
    { top: 25, left: 60, width: 1080, height: 3 },
    // Bottom horizontal stem
    { top: 602, left: 60, width: 1080, height: 3 },
  ];

  // Small dots at leaf-stem junctions
  const junctionDots = [
    ...leftLeaves.map((l) => ({ top: l.top + 4, left: l.left + 15, size: 5 })),
    ...rightLeaves.map((l) => ({ top: l.top + 4, left: l.left + 5, size: 5 })),
  ];

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#1a1a18',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Outer thick border — chunky frame */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 6,
          left: 6,
          right: 6,
          bottom: 6,
          border: '4px solid #e8e0d0',
          opacity: 0.8,
        }}
      />
      {/* Inner border */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 48,
          left: 48,
          right: 48,
          bottom: 48,
          border: '3px solid #e8e0d0',
          opacity: 0.5,
        }}
      />

      {/* Branch stems */}
      {stems.map((stem, i) => (
        <div
          key={`s${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: stem.top,
            left: stem.left,
            width: stem.width,
            height: stem.height,
            backgroundColor: '#e8e0d0',
            opacity: 0.6,
          }}
        />
      ))}

      {/* Left leaves */}
      {leftLeaves.map((leaf, i) => (
        <div
          key={`ll${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: leaf.top,
            left: leaf.left,
            width: leaf.width,
            height: leaf.height,
            borderRadius: '50%',
            backgroundColor: '#e8e0d0',
            opacity: 0.55,
          }}
        />
      ))}

      {/* Right leaves */}
      {rightLeaves.map((leaf, i) => (
        <div
          key={`rl${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: leaf.top,
            left: leaf.left,
            width: leaf.width,
            height: leaf.height,
            borderRadius: '50%',
            backgroundColor: '#e8e0d0',
            opacity: 0.55,
          }}
        />
      ))}

      {/* Top leaves */}
      {topLeaves.map((leaf, i) => (
        <div
          key={`tl${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: leaf.top,
            left: leaf.left,
            width: leaf.width,
            height: leaf.height,
            borderRadius: '50%',
            backgroundColor: '#e8e0d0',
            opacity: 0.5,
          }}
        />
      ))}

      {/* Bottom leaves */}
      {bottomLeaves.map((leaf, i) => (
        <div
          key={`bl${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: leaf.top,
            left: leaf.left,
            width: leaf.width,
            height: leaf.height,
            borderRadius: '50%',
            backgroundColor: '#e8e0d0',
            opacity: 0.5,
          }}
        />
      ))}

      {/* Junction dots */}
      {junctionDots.map((dot, i) => (
        <div
          key={`j${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: dot.top,
            left: dot.left,
            width: dot.size,
            height: dot.size,
            borderRadius: dot.size / 2,
            backgroundColor: '#e8e0d0',
            opacity: 0.7,
          }}
        />
      ))}

      {/* Corner ornaments — chunky squares */}
      {[
        { top: 8, left: 8 },
        { top: 8, left: 1172 },
        { top: 602, left: 8 },
        { top: 602, left: 1172 },
      ].map((corner, i) => (
        <div
          key={`co${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: corner.top,
            left: corner.left,
            width: 20,
            height: 20,
            backgroundColor: '#e8e0d0',
            opacity: 0.7,
          }}
        />
      ))}

      {/* Content area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          top: 70,
          left: 80,
          right: 80,
          bottom: 70,
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 5,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} width={30} height={30} />
          <span
            style={{
              marginLeft: 10,
              fontSize: 16,
              fontWeight: 800,
              color: '#e8e0d0',
              letterSpacing: '0.2em',
            }}
          >
            INFERENCEX
          </span>
        </div>

        {/* Title block — bold stamped feel */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            maxWidth: 900,
          }}
        >
          {/* Decorative line above title */}
          <div
            style={{
              display: 'flex',
              width: 200,
              height: 4,
              backgroundColor: '#e8e0d0',
              marginBottom: 20,
              opacity: 0.6,
            }}
          />

          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 900,
              color: '#e8e0d0',
              lineHeight: 1.2,
              textAlign: 'center',
              justifyContent: 'center',
              letterSpacing: '0.02em',
            }}
          >
            {meta.title.toUpperCase()}
          </div>

          {/* Decorative line below title */}
          <div
            style={{
              display: 'flex',
              width: 200,
              height: 4,
              backgroundColor: '#e8e0d0',
              marginTop: 20,
              opacity: 0.6,
            }}
          />

          {/* Excerpt */}
          <div
            style={{
              display: 'flex',
              fontSize: 16,
              color: '#b0a890',
              lineHeight: 1.5,
              textAlign: 'center',
              marginTop: 16,
              justifyContent: 'center',
              maxWidth: 650,
            }}
          >
            {meta.excerpt.length > 120 ? meta.excerpt.slice(0, 120) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 14,
              color: '#c0b8a0',
              fontWeight: 700,
              letterSpacing: '0.12em',
            }}
          >
            {meta.author.toUpperCase()} &middot; {formattedDate.toUpperCase()} &middot;{' '}
            {meta.readingTime} MIN
          </div>
          {meta.tags && (
            <div style={{ display: 'flex', gap: 14 }}>
              {meta.tags.slice(0, 3).map((tag) => (
                <div
                  key={tag}
                  style={{
                    display: 'flex',
                    fontSize: 11,
                    color: '#908870',
                    letterSpacing: '0.15em',
                    fontWeight: 700,
                  }}
                >
                  {tag.toUpperCase()}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    size,
  );
}
