/**
 * V169: Impossible Geometry — Escher-inspired impossible triangle illusion using positioned rectangles on dark background.
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

  // Build an impossible triangle illusion using overlapping rectangles
  // Three "beams" that appear to connect impossibly
  // Each beam has a light face and a dark face to create 3D illusion

  // Beam 1: Bottom horizontal (left to right)
  // Beam 2: Left side going up-right
  // Beam 3: Right side going up-left

  // We approximate the Penrose triangle with carefully positioned rectangles
  const cx = 200; // Center x offset for the figure
  const cy = 80; // Center y offset

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0c0c14',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle grid background */}
      {Array.from({ length: 20 }, (_, i) => (
        <div
          key={`gh${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: i * 33,
            left: 0,
            width: '100%',
            height: 1,
            backgroundColor: '#ffffff',
            opacity: 0.03,
          }}
        />
      ))}
      {Array.from({ length: 30 }, (_, i) => (
        <div
          key={`gv${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: 0,
            left: i * 42,
            width: 1,
            height: '100%',
            backgroundColor: '#ffffff',
            opacity: 0.03,
          }}
        />
      ))}

      {/* Impossible triangle — built from rectangular "beams" */}
      {/* Bottom beam: horizontal bar */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: cy + 380,
          left: cx + 60,
          width: 300,
          height: 50,
          backgroundColor: '#4a6fa5',
        }}
      />
      {/* Bottom beam top face */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: cy + 360,
          left: cx + 80,
          width: 300,
          height: 20,
          backgroundColor: '#6b8fc5',
        }}
      />

      {/* Left beam: vertical bar going up */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: cy + 130,
          left: cx + 60,
          width: 50,
          height: 250,
          backgroundColor: '#3a5a8a',
        }}
      />
      {/* Left beam right face (lighter) */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: cy + 110,
          left: cx + 110,
          width: 20,
          height: 260,
          backgroundColor: '#5a7aaa',
        }}
      />

      {/* Top connector: horizontal at top */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: cy + 110,
          left: cx + 80,
          width: 270,
          height: 50,
          backgroundColor: '#6b8fc5',
        }}
      />
      {/* Top connector bottom face */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: cy + 160,
          left: cx + 100,
          width: 250,
          height: 20,
          backgroundColor: '#4a6fa5',
        }}
      />

      {/* Right beam: vertical bar going down */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: cy + 160,
          left: cx + 310,
          width: 50,
          height: 250,
          backgroundColor: '#5a7aaa',
        }}
      />
      {/* Right beam left face (darker) */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: cy + 170,
          left: cx + 290,
          width: 20,
          height: 230,
          backgroundColor: '#3a5a8a',
        }}
      />

      {/* "Impossible" overlap: bottom-right corner where beams cross impossibly */}
      {/* The right beam appears to go BEHIND the bottom beam, creating the paradox */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: cy + 380,
          left: cx + 290,
          width: 70,
          height: 50,
          backgroundColor: '#4a6fa5',
          zIndex: 5,
        }}
      />
      {/* But the top of the right beam passes in FRONT — paradox marker */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: cy + 360,
          left: cx + 310,
          width: 50,
          height: 20,
          backgroundColor: '#6b8fc5',
          zIndex: 4,
        }}
      />

      {/* "Impossible" overlap: top-left corner */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: cy + 110,
          left: cx + 60,
          width: 50,
          height: 50,
          backgroundColor: '#3a5a8a',
          zIndex: 5,
        }}
      />

      {/* Question mark accent near the impossible joint */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: cy + 440,
          left: cx + 170,
          fontSize: 20,
          color: '#4a6fa5',
          opacity: 0.4,
          letterSpacing: '0.3em',
        }}
      >
        IMPOSSIBLE
      </div>

      {/* Content — right side */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          top: 60,
          left: 580,
          right: 60,
          bottom: 60,
          justifyContent: 'space-between',
          zIndex: 10,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} width={32} height={32} />
          <span
            style={{
              marginLeft: 10,
              fontSize: 16,
              fontWeight: 700,
              color: '#6b8fc5',
              letterSpacing: '0.15em',
            }}
          >
            INFERENCEX
          </span>
        </div>

        {/* Title + excerpt */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize * 0.85,
              fontWeight: 800,
              color: '#e0e8f0',
              lineHeight: 1.2,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 17,
              color: '#7090b0',
              lineHeight: 1.5,
              marginTop: 14,
            }}
          >
            {meta.excerpt.length > 120 ? meta.excerpt.slice(0, 120) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 14,
              color: '#5a7a9a',
            }}
          >
            {meta.author} &middot; {formattedDate} &middot; {meta.readingTime} min read
          </div>
          {meta.tags && (
            <div style={{ display: 'flex', gap: 12 }}>
              {meta.tags.slice(0, 3).map((tag) => (
                <div
                  key={tag}
                  style={{
                    display: 'flex',
                    fontSize: 11,
                    color: '#4a6a8a',
                    letterSpacing: '0.15em',
                    fontWeight: 600,
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
