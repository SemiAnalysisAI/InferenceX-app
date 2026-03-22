/**
 * V167: Rothko — Color field painting with large stacked horizontal color blocks on dark background, contemplative and emotional.
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

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#1a1018',
        position: 'relative',
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Outer subtle warm wash */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: '#1e1420',
        }}
      />

      {/* Top color field — dark maroon/crimson */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 60,
          left: 100,
          right: 100,
          height: 200,
          backgroundColor: '#8b0000',
          borderRadius: 8,
          opacity: 0.85,
        }}
      />
      {/* Soft inner glow on top field */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 75,
          left: 120,
          right: 120,
          height: 170,
          backgroundColor: '#a01020',
          borderRadius: 6,
          opacity: 0.4,
        }}
      />

      {/* Middle color field — deep navy/midnight blue */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 280,
          left: 100,
          right: 100,
          height: 180,
          backgroundColor: '#191970',
          borderRadius: 8,
          opacity: 0.85,
        }}
      />
      {/* Soft inner glow on middle field */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 295,
          left: 120,
          right: 120,
          height: 150,
          backgroundColor: '#2a2a90',
          borderRadius: 6,
          opacity: 0.35,
        }}
      />

      {/* Bottom color field — near-black */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 480,
          left: 100,
          right: 100,
          height: 100,
          backgroundColor: '#0d0d15',
          borderRadius: 8,
          opacity: 0.9,
        }}
      />
      {/* Subtle warmth in bottom field */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 490,
          left: 130,
          right: 130,
          height: 80,
          backgroundColor: '#1a1525',
          borderRadius: 6,
          opacity: 0.5,
        }}
      />

      {/* Narrow gap glow between top and middle fields */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 258,
          left: 110,
          right: 110,
          height: 24,
          backgroundColor: '#3a1530',
          borderRadius: 12,
          opacity: 0.4,
        }}
      />

      {/* Narrow gap glow between middle and bottom fields */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 458,
          left: 110,
          right: 110,
          height: 24,
          backgroundColor: '#10102a',
          borderRadius: 12,
          opacity: 0.4,
        }}
      />

      {/* Logo — top left, muted */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          position: 'absolute',
          top: 18,
          left: 40,
          zIndex: 3,
        }}
      >
        <img src={logoSrc} width={24} height={24} style={{ opacity: 0.5 }} />
        <span
          style={{
            marginLeft: 8,
            fontSize: 14,
            fontWeight: 600,
            color: '#8b7070',
            letterSpacing: '0.15em',
          }}
        >
          INFERENCEX
        </span>
      </div>

      {/* Title — centered in the middle color field, low contrast */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          top: 290,
          left: 150,
          right: 150,
          height: 160,
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 3,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: titleSize,
            fontWeight: 700,
            color: '#3838a8',
            lineHeight: 1.2,
            textAlign: 'center',
            justifyContent: 'center',
            opacity: 0.7,
          }}
        >
          {meta.title}
        </div>
      </div>

      {/* Excerpt — floating in top color field */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 120,
          left: 180,
          right: 180,
          justifyContent: 'center',
          zIndex: 3,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 18,
            color: '#c07070',
            lineHeight: 1.5,
            textAlign: 'center',
            opacity: 0.6,
            justifyContent: 'center',
          }}
        >
          {meta.excerpt.length > 120 ? meta.excerpt.slice(0, 120) + '\u2026' : meta.excerpt}
        </div>
      </div>

      {/* Footer — in bottom field */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 30,
          left: 0,
          right: 0,
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 3,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 14,
            color: '#555560',
            letterSpacing: '0.1em',
          }}
        >
          {meta.author} &middot; {formattedDate} &middot; {meta.readingTime} min read
        </div>
      </div>

      {/* Tags — top right, very subtle */}
      {meta.tags && (
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            top: 20,
            right: 40,
            gap: 14,
            zIndex: 3,
          }}
        >
          {meta.tags.slice(0, 3).map((tag) => (
            <div
              key={tag}
              style={{
                display: 'flex',
                fontSize: 11,
                color: '#6a5060',
                letterSpacing: '0.15em',
              }}
            >
              {tag.toUpperCase()}
            </div>
          ))}
        </div>
      )}
    </div>,
    size,
  );
}
