/**
 * V126: Ancient Scroll — Warm parchment papyrus with rolled scroll edges, aged stains, and formal ancient typography.
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
  const excerpt = meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt;

  // Generate scattered stain positions
  const stains = [
    { top: 80, left: 200, size: 12, opacity: 0.15 },
    { top: 150, left: 900, size: 18, opacity: 0.1 },
    { top: 300, left: 150, size: 10, opacity: 0.12 },
    { top: 400, left: 850, size: 15, opacity: 0.08 },
    { top: 500, left: 400, size: 20, opacity: 0.1 },
    { top: 120, left: 600, size: 8, opacity: 0.14 },
    { top: 450, left: 700, size: 14, opacity: 0.09 },
    { top: 250, left: 350, size: 11, opacity: 0.13 },
    { top: 550, left: 250, size: 16, opacity: 0.07 },
    { top: 350, left: 1000, size: 9, opacity: 0.11 },
  ];

  // Scroll roller segments for left and right edges
  const rollerSegments = Array.from({ length: 14 }, (_, i) => i);

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#2a2318',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Parchment background area */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 60,
          right: 60,
          bottom: 0,
          backgroundColor: '#d4c5a0',
        }}
      />

      {/* Aged inner parchment layer */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 10,
          left: 70,
          right: 70,
          bottom: 10,
          backgroundColor: '#ddd0ac',
          opacity: 0.7,
        }}
      />

      {/* Scattered stain dots */}
      {stains.map((stain, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            top: stain.top,
            left: stain.left,
            width: stain.size,
            height: stain.size,
            borderRadius: stain.size,
            backgroundColor: '#8b6914',
            opacity: stain.opacity,
          }}
        />
      ))}

      {/* Left scroll roller */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          top: 0,
          left: 30,
          width: 50,
          height: '100%',
        }}
      >
        {rollerSegments.map((i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              width: 50,
              height: 45,
              borderRadius: 25,
              backgroundColor: i % 2 === 0 ? '#6b4c2a' : '#7d5a34',
              borderRight: '3px solid #4a3520',
              borderLeft: '3px solid #8b6b45',
            }}
          />
        ))}
      </div>

      {/* Right scroll roller */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          top: 0,
          right: 30,
          width: 50,
          height: '100%',
        }}
      >
        {rollerSegments.map((i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              width: 50,
              height: 45,
              borderRadius: 25,
              backgroundColor: i % 2 === 0 ? '#6b4c2a' : '#7d5a34',
              borderLeft: '3px solid #4a3520',
              borderRight: '3px solid #8b6b45',
            }}
          />
        ))}
      </div>

      {/* Left roller cap - top */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: -8,
          left: 22,
          width: 66,
          height: 20,
          borderRadius: 10,
          backgroundColor: '#4a3520',
        }}
      />

      {/* Left roller cap - bottom */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: -8,
          left: 22,
          width: 66,
          height: 20,
          borderRadius: 10,
          backgroundColor: '#4a3520',
        }}
      />

      {/* Right roller cap - top */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: -8,
          right: 22,
          width: 66,
          height: 20,
          borderRadius: 10,
          backgroundColor: '#4a3520',
        }}
      />

      {/* Right roller cap - bottom */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: -8,
          right: 22,
          width: 66,
          height: 20,
          borderRadius: 10,
          backgroundColor: '#4a3520',
        }}
      />

      {/* Content area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          padding: '50px 120px',
          height: '100%',
          zIndex: 2,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <img src={logoSrc} width={36} height={36} />
          <span
            style={{
              marginLeft: 12,
              fontSize: 18,
              color: '#4a3520',
              fontWeight: 600,
              letterSpacing: '0.1em',
            }}
          >
            INFERENCEX
          </span>
        </div>

        {/* Decorative line */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: 2,
            backgroundColor: '#8b6914',
            opacity: 0.4,
            marginBottom: 8,
          }}
        />
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: 1,
            backgroundColor: '#8b6914',
            opacity: 0.3,
            marginBottom: 30,
          }}
        />

        {/* Title */}
        <div
          style={{
            display: 'flex',
            fontSize: titleSize,
            fontWeight: 700,
            color: '#2a1f10',
            lineHeight: 1.2,
            marginBottom: 20,
            maxWidth: 900,
          }}
        >
          {meta.title}
        </div>

        {/* Excerpt */}
        <div
          style={{
            display: 'flex',
            fontSize: 20,
            color: '#5a4a30',
            lineHeight: 1.5,
            marginBottom: 30,
            maxWidth: 800,
          }}
        >
          {excerpt}
        </div>

        {/* Spacer */}
        <div style={{ display: 'flex', flex: 1 }} />

        {/* Bottom decorative line */}
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: 1,
            backgroundColor: '#8b6914',
            opacity: 0.3,
            marginBottom: 8,
          }}
        />
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: 2,
            backgroundColor: '#8b6914',
            opacity: 0.4,
            marginBottom: 16,
          }}
        />

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 16,
              color: '#6b5530',
              fontStyle: 'italic',
            }}
          >
            Written in the year of {formattedDate}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 16,
              color: '#6b5530',
            }}
          >
            by {meta.author} &middot; {meta.readingTime} min read
          </div>
        </div>

        {/* Tags */}
        {meta.tags && (
          <div style={{ display: 'flex', marginTop: 10, gap: 8 }}>
            {meta.tags.slice(0, 3).map((tag) => (
              <div
                key={tag}
                style={{
                  display: 'flex',
                  fontSize: 12,
                  color: '#8b6914',
                  border: '1px solid #8b691444',
                  borderRadius: 4,
                  padding: '2px 8px',
                }}
              >
                {tag}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    size,
  );
}
