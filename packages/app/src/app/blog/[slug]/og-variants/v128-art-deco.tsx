/**
 * V128: Art Deco — Black background with gold geometric sunburst rays, symmetrical layout, Gatsby-era elegance.
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

  // Sunburst rays from top center - using tall narrow divs rotated via positioning
  // Since we can't use transform, we'll create rays as angled positioned rectangles
  // We'll simulate rays by placing thin tall divs at various horizontal positions
  const rays = Array.from({ length: 24 }, (_, i) => {
    const angle = (i / 24) * Math.PI;
    const spreadX = Math.cos(angle) * 800;
    const _spreadY = Math.sin(angle) * 600;
    return {
      left: 600 + spreadX * 0.5 - 1,
      top: -20,
      width: 2,
      height: 650,
      opacity: 0.06 + (i % 3) * 0.02,
    };
  });

  // Parallel framing lines
  const frameLines = [
    { top: 130, left: 100, right: 100, height: 1 },
    { top: 134, left: 120, right: 120, height: 2 },
    { top: 140, left: 100, right: 100, height: 1 },
    { top: 470, left: 100, right: 100, height: 1 },
    { top: 474, left: 120, right: 120, height: 2 },
    { top: 480, left: 100, right: 100, height: 1 },
  ];

  // Vertical framing lines
  const vertLines = [
    { top: 130, left: 98, width: 1, height: 352 },
    { top: 130, left: 102, width: 2, height: 352 },
    { top: 130, right: 98, width: 1, height: 352 },
    { top: 130, right: 102, width: 2, height: 352 },
  ];

  // Decorative corner diamonds
  const corners = [
    { top: 126, left: 92 },
    { top: 126, left: 1092 },
    { top: 472, left: 92 },
    { top: 472, left: 1092 },
  ];

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0a0a0a',
        position: 'relative',
        overflow: 'hidden',
        alignItems: 'center',
      }}
    >
      {/* Sunburst rays */}
      {rays.map((ray, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            top: ray.top,
            left: ray.left,
            width: ray.width,
            height: ray.height,
            backgroundColor: '#d4af37',
            opacity: ray.opacity,
          }}
        />
      ))}

      {/* Central gold glow circle */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: -150,
          left: 450,
          width: 300,
          height: 300,
          borderRadius: 150,
          backgroundColor: '#d4af37',
          opacity: 0.06,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: -80,
          left: 500,
          width: 200,
          height: 200,
          borderRadius: 100,
          backgroundColor: '#d4af37',
          opacity: 0.04,
        }}
      />

      {/* Horizontal frame lines */}
      {frameLines.map((line, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            top: line.top,
            left: line.left,
            right: line.right,
            height: line.height,
            backgroundColor: '#d4af37',
            opacity: 0.5,
          }}
        />
      ))}

      {/* Vertical frame lines */}
      {vertLines.map((line, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            top: line.top,
            left: 'left' in line ? line.left : undefined,
            right: 'right' in line ? line.right : undefined,
            width: line.width,
            height: line.height,
            backgroundColor: '#d4af37',
            opacity: 0.5,
          }}
        />
      ))}

      {/* Corner diamonds */}
      {corners.map((corner, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            position: 'absolute',
            top: corner.top,
            left: corner.left,
            width: 16,
            height: 16,
            backgroundColor: '#d4af37',
            opacity: 0.7,
            borderRadius: 2,
          }}
        />
      ))}

      {/* Top center ornament */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 20,
          left: 540,
          width: 120,
          height: 4,
          backgroundColor: '#d4af37',
          opacity: 0.6,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 30,
          left: 560,
          width: 80,
          height: 2,
          backgroundColor: '#d4af37',
          opacity: 0.4,
        }}
      />

      {/* Logo centered at top */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'absolute',
          top: 50,
          left: 0,
          right: 0,
          zIndex: 3,
        }}
      >
        <img src={logoSrc} width={30} height={30} />
        <span
          style={{
            marginLeft: 10,
            fontSize: 18,
            color: '#d4af37',
            fontWeight: 600,
            letterSpacing: '0.3em',
          }}
        >
          INFERENCEX
        </span>
      </div>

      {/* Top decorative chevrons */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 95,
          left: 530,
          width: 140,
          height: 20,
          justifyContent: 'center',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <div
          style={{
            display: 'flex',
            width: 20,
            height: 2,
            backgroundColor: '#d4af37',
            opacity: 0.5,
          }}
        />
        <div
          style={{
            display: 'flex',
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: '#d4af37',
            opacity: 0.6,
          }}
        />
        <div
          style={{
            display: 'flex',
            width: 20,
            height: 2,
            backgroundColor: '#d4af37',
            opacity: 0.5,
          }}
        />
      </div>

      {/* Title — centered, all caps, wide spacing */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          position: 'absolute',
          top: 160,
          left: 140,
          right: 140,
          zIndex: 3,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: titleSize,
            fontWeight: 800,
            color: '#d4af37',
            lineHeight: 1.2,
            textAlign: 'center',
            letterSpacing: '0.05em',
            justifyContent: 'center',
          }}
        >
          {meta.title.toUpperCase()}
        </div>

        {/* Excerpt */}
        <div
          style={{
            display: 'flex',
            fontSize: 18,
            color: '#a08940',
            lineHeight: 1.5,
            textAlign: 'center',
            marginTop: 20,
            justifyContent: 'center',
            maxWidth: 700,
          }}
        >
          {excerpt}
        </div>
      </div>

      {/* Bottom section */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          position: 'absolute',
          bottom: 40,
          left: 0,
          right: 0,
          zIndex: 3,
        }}
      >
        {/* Bottom ornament */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 15,
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 40,
              height: 1,
              backgroundColor: '#d4af37',
              opacity: 0.4,
            }}
          />
          <div
            style={{
              display: 'flex',
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: '#d4af37',
              opacity: 0.5,
            }}
          />
          <div
            style={{
              display: 'flex',
              width: 40,
              height: 1,
              backgroundColor: '#d4af37',
              opacity: 0.4,
            }}
          />
        </div>

        {/* Author and date */}
        <div
          style={{
            display: 'flex',
            fontSize: 16,
            color: '#8a7530',
            letterSpacing: '0.15em',
          }}
        >
          {meta.author.toUpperCase()} &middot; {formattedDate.toUpperCase()} &middot;{' '}
          {meta.readingTime} MIN
        </div>

        {/* Tags */}
        {meta.tags && (
          <div style={{ display: 'flex', marginTop: 10, gap: 16 }}>
            {meta.tags.slice(0, 3).map((tag) => (
              <div
                key={tag}
                style={{
                  display: 'flex',
                  fontSize: 11,
                  color: '#d4af37',
                  letterSpacing: '0.2em',
                  opacity: 0.6,
                }}
              >
                {tag.toUpperCase()}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    size,
  );
}
