/**
 * V129: Constructivist — Soviet constructivist propaganda with bold red and black diagonal split, heavy caps, geometric shapes, and angular layout.
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
      }}
    >
      {/* Diagonal red zone — simulated with overlapping rectangles */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: '#cc0000',
        }}
      />

      {/* Black diagonal cut — large black rectangle positioned to create diagonal */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: -200,
          right: -100,
          width: 900,
          height: 1100,
          backgroundColor: '#0a0a0a',
          borderRadius: 0,
        }}
      />

      {/* Secondary black wedge for sharper diagonal effect */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 500,
          width: 800,
          height: 630,
          backgroundColor: '#0a0a0a',
        }}
      />

      {/* Red triangular accent in the black zone */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 480,
          width: 120,
          height: 630,
          backgroundColor: '#cc0000',
          opacity: 0.15,
        }}
      />

      {/* Large geometric circle — top right */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 30,
          right: 60,
          width: 120,
          height: 120,
          borderRadius: 60,
          border: '5px solid #cc0000',
          opacity: 0.6,
        }}
      />

      {/* Smaller circle inside */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 55,
          right: 85,
          width: 70,
          height: 70,
          borderRadius: 35,
          backgroundColor: '#cc0000',
          opacity: 0.3,
        }}
      />

      {/* Triangle shape — using bordered div */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 80,
          right: 120,
          width: 0,
          height: 0,
          borderLeft: '40px solid transparent',
          borderRight: '40px solid transparent',
          borderBottom: '70px solid #cc0000',
          opacity: 0.4,
        }}
      />

      {/* Geometric square */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 200,
          right: 200,
          width: 50,
          height: 50,
          border: '4px solid #cc0000',
          opacity: 0.35,
        }}
      />

      {/* Horizontal aggressive lines */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 160,
          left: 0,
          width: 450,
          height: 4,
          backgroundColor: '#ffffff',
          opacity: 0.2,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 172,
          left: 0,
          width: 350,
          height: 2,
          backgroundColor: '#ffffff',
          opacity: 0.15,
        }}
      />

      {/* "READ NOW" propaganda banner */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 30,
          left: 30,
          backgroundColor: '#ffffff',
          padding: '6px 20px',
          zIndex: 4,
        }}
      >
        <span
          style={{
            display: 'flex',
            fontSize: 14,
            fontWeight: 900,
            color: '#cc0000',
            letterSpacing: '0.3em',
          }}
        >
          READ NOW
        </span>
      </div>

      {/* Blog post number badge */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 30,
          left: 200,
          backgroundColor: '#cc0000',
          padding: '6px 16px',
          zIndex: 4,
        }}
      >
        <span
          style={{
            display: 'flex',
            fontSize: 13,
            fontWeight: 800,
            color: '#ffffff',
            letterSpacing: '0.2em',
          }}
        >
          BLOG POST No. {meta.readingTime}
        </span>
      </div>

      {/* Logo */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          position: 'absolute',
          top: 80,
          left: 40,
          zIndex: 4,
        }}
      >
        <img src={logoSrc} width={28} height={28} />
        <span
          style={{
            marginLeft: 8,
            fontSize: 16,
            color: '#ffffff',
            fontWeight: 800,
            letterSpacing: '0.2em',
          }}
        >
          INFERENCEX
        </span>
      </div>

      {/* Title — heavy bold caps */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 190,
          left: 40,
          right: 250,
          zIndex: 4,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: titleSize + 2,
            fontWeight: 900,
            color: '#ffffff',
            lineHeight: 1.1,
            letterSpacing: '0.02em',
          }}
        >
          {meta.title.toUpperCase()}
        </div>
      </div>

      {/* Excerpt */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 400,
          left: 40,
          right: 300,
          zIndex: 4,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 18,
            color: '#cccccc',
            lineHeight: 1.4,
          }}
        >
          {excerpt}
        </div>
      </div>

      {/* Bottom stripe */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '100%',
          height: 6,
          backgroundColor: '#cc0000',
        }}
      />

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 25,
          left: 40,
          zIndex: 4,
          alignItems: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 14,
            color: '#888888',
            fontWeight: 700,
            letterSpacing: '0.15em',
          }}
        >
          {meta.author.toUpperCase()} &middot; {formattedDate.toUpperCase()}
        </div>
      </div>

      {/* Tags */}
      {meta.tags && (
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: 25,
            right: 40,
            gap: 12,
            zIndex: 4,
          }}
        >
          {meta.tags.slice(0, 3).map((tag) => (
            <div
              key={tag}
              style={{
                display: 'flex',
                fontSize: 11,
                color: '#cc0000',
                fontWeight: 800,
                letterSpacing: '0.15em',
                border: '2px solid #cc0000',
                padding: '3px 10px',
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
