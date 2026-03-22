/**
 * V168: Kandinsky — Abstract geometric composition with scattered circles, triangles, and rectangles in bright colors on warm parchment.
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

  // Circles scattered around
  const circles = [
    { top: 30, left: 50, size: 90, color: '#e60000', opacity: 0.7 },
    { top: 80, left: 900, size: 120, color: '#0044cc', opacity: 0.6 },
    { top: 400, left: 80, size: 60, color: '#ffd700', opacity: 0.8 },
    { top: 450, left: 1050, size: 100, color: '#e60000', opacity: 0.5 },
    { top: 200, left: 1050, size: 50, color: '#228b22', opacity: 0.6 },
    { top: 520, left: 500, size: 70, color: '#0044cc', opacity: 0.4 },
    { top: 15, left: 500, size: 40, color: '#000000', opacity: 0.5 },
    { top: 350, left: 950, size: 35, color: '#ffd700', opacity: 0.7 },
    { top: 100, left: 300, size: 25, color: '#228b22', opacity: 0.5 },
    { top: 550, left: 200, size: 45, color: '#000000', opacity: 0.3 },
  ];

  // Rectangles
  const rects = [
    { top: 150, left: 30, width: 80, height: 30, color: '#000000', opacity: 0.6 },
    { top: 500, left: 800, width: 120, height: 15, color: '#e60000', opacity: 0.5 },
    { top: 50, left: 700, width: 15, height: 100, color: '#000000', opacity: 0.4 },
    { top: 300, left: 1100, width: 60, height: 8, color: '#0044cc', opacity: 0.6 },
    { top: 470, left: 350, width: 8, height: 80, color: '#000000', opacity: 0.5 },
    { top: 20, left: 200, width: 50, height: 6, color: '#e60000', opacity: 0.4 },
  ];

  // Lines (thin rectangles)
  const lines = [
    { top: 180, left: 60, width: 200, height: 3, color: '#000000', opacity: 0.35 },
    { top: 400, left: 900, width: 180, height: 2, color: '#000000', opacity: 0.3 },
    { top: 100, left: 800, width: 3, height: 150, color: '#000000', opacity: 0.25 },
    { top: 350, left: 150, width: 3, height: 120, color: '#000000', opacity: 0.3 },
    { top: 550, left: 700, width: 250, height: 2, color: '#000000', opacity: 0.2 },
    { top: 280, left: 50, width: 150, height: 2, color: '#e60000', opacity: 0.2 },
  ];

  // Triangles (CSS border trick): pointing up
  const triangles = [
    { top: 250, left: 900, size: 60, color: '#ffd700', opacity: 0.7 },
    { top: 50, left: 400, size: 45, color: '#e60000', opacity: 0.5 },
    { top: 480, left: 650, size: 50, color: '#0044cc', opacity: 0.5 },
    { top: 150, left: 1100, size: 35, color: '#000000', opacity: 0.4 },
    { top: 500, left: 100, size: 40, color: '#228b22', opacity: 0.6 },
  ];

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#f0ebe0',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Circles */}
      {circles.map((c, i) => (
        <div
          key={`ci${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: c.top,
            left: c.left,
            width: c.size,
            height: c.size,
            borderRadius: c.size / 2,
            backgroundColor: c.color,
            opacity: c.opacity,
          }}
        />
      ))}

      {/* Some circles as rings (border only) */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 200,
          left: 150,
          width: 100,
          height: 100,
          borderRadius: 50,
          border: '4px solid #000000',
          opacity: 0.3,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 380,
          left: 750,
          width: 80,
          height: 80,
          borderRadius: 40,
          border: '3px solid #e60000',
          opacity: 0.4,
        }}
      />

      {/* Rectangles */}
      {rects.map((r, i) => (
        <div
          key={`r${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: r.top,
            left: r.left,
            width: r.width,
            height: r.height,
            backgroundColor: r.color,
            opacity: r.opacity,
          }}
        />
      ))}

      {/* Lines */}
      {lines.map((l, i) => (
        <div
          key={`l${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: l.top,
            left: l.left,
            width: l.width,
            height: l.height,
            backgroundColor: l.color,
            opacity: l.opacity,
          }}
        />
      ))}

      {/* Triangles via CSS border trick */}
      {triangles.map((t, i) => (
        <div
          key={`t${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: t.top,
            left: t.left,
            width: 0,
            height: 0,
            borderLeft: `${t.size / 2}px solid transparent`,
            borderRight: `${t.size / 2}px solid transparent`,
            borderBottom: `${t.size}px solid ${t.color}`,
            opacity: t.opacity,
          }}
        />
      ))}

      {/* Central content zone */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          top: 140,
          left: 200,
          right: 200,
          bottom: 100,
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 3,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <img src={logoSrc} width={30} height={30} />
          <span
            style={{
              marginLeft: 10,
              fontSize: 16,
              fontWeight: 700,
              color: '#000000',
              letterSpacing: '0.12em',
            }}
          >
            INFERENCEX
          </span>
        </div>

        {/* Title */}
        <div
          style={{
            display: 'flex',
            fontSize: titleSize,
            fontWeight: 900,
            color: '#1a1a1a',
            lineHeight: 1.15,
            textAlign: 'center',
            justifyContent: 'center',
          }}
        >
          {meta.title}
        </div>

        {/* Excerpt */}
        <div
          style={{
            display: 'flex',
            fontSize: 18,
            color: '#444444',
            lineHeight: 1.5,
            textAlign: 'center',
            marginTop: 16,
            justifyContent: 'center',
            maxWidth: 600,
          }}
        >
          {meta.excerpt.length > 120 ? meta.excerpt.slice(0, 120) + '\u2026' : meta.excerpt}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 28,
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
            color: '#555555',
            fontWeight: 600,
          }}
        >
          {meta.author} &middot; {formattedDate} &middot; {meta.readingTime} min read
        </div>
      </div>

      {/* Tags */}
      {meta.tags && (
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: 8,
            left: 0,
            right: 0,
            justifyContent: 'center',
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
                color: '#777777',
                fontWeight: 600,
                letterSpacing: '0.1em',
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
