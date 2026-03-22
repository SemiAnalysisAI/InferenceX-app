/**
 * V166: Mondrian — De Stijl composition with bold black grid lines and primary color cells on white.
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

  // Mondrian grid: define the black lines
  const horizontalLines = [
    { top: 0, left: 0, width: 1200, height: 8 },
    { top: 180, left: 0, width: 1200, height: 7 },
    { top: 420, left: 0, width: 1200, height: 7 },
    { top: 622, left: 0, width: 1200, height: 8 },
  ];

  const verticalLines = [
    { top: 0, left: 0, width: 8, height: 630 },
    { top: 0, left: 320, width: 7, height: 630 },
    { top: 0, left: 820, width: 7, height: 630 },
    { top: 0, left: 1192, width: 8, height: 630 },
  ];

  // Colored cells (positioned within grid areas)
  const colorCells = [
    // Top-left cell: RED
    { top: 8, left: 8, width: 305, height: 165, color: '#e60000' },
    // Top-right cell: BLUE
    { top: 8, left: 827, width: 365, height: 165, color: '#0000cc' },
    // Bottom-left cell: YELLOW
    { top: 427, left: 8, width: 305, height: 195, color: '#ffd700' },
    // Bottom-right small cell: RED
    { top: 427, left: 827, width: 365, height: 195, color: '#e60000' },
    // Middle-right cell: YELLOW
    { top: 187, left: 827, width: 365, height: 226, color: '#ffd700' },
  ];

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#f5f5f0',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Colored cells */}
      {colorCells.map((cell, i) => (
        <div
          key={`c${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: cell.top,
            left: cell.left,
            width: cell.width,
            height: cell.height,
            backgroundColor: cell.color,
          }}
        />
      ))}

      {/* Horizontal black lines */}
      {horizontalLines.map((line, i) => (
        <div
          key={`h${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: line.top,
            left: line.left,
            width: line.width,
            height: line.height,
            backgroundColor: '#000000',
          }}
        />
      ))}

      {/* Vertical black lines */}
      {verticalLines.map((line, i) => (
        <div
          key={`v${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: line.top,
            left: line.left,
            width: line.width,
            height: line.height,
            backgroundColor: '#000000',
          }}
        />
      ))}

      {/* Main content area: large white center cell */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          top: 187,
          left: 327,
          width: 493,
          height: 233,
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px 30px',
          zIndex: 2,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <img src={logoSrc} width={28} height={28} />
          <span
            style={{
              marginLeft: 8,
              fontSize: 15,
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
            fontSize: titleSize * 0.75,
            fontWeight: 900,
            color: '#000000',
            lineHeight: 1.15,
            textAlign: 'center',
            justifyContent: 'center',
          }}
        >
          {meta.title}
        </div>
      </div>

      {/* Footer in bottom-center white cell */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          top: 427,
          left: 327,
          width: 493,
          height: 195,
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 2,
        }}
      >
        {/* Excerpt */}
        <div
          style={{
            display: 'flex',
            fontSize: 16,
            color: '#333333',
            lineHeight: 1.4,
            textAlign: 'center',
            marginBottom: 14,
            justifyContent: 'center',
            maxWidth: 420,
          }}
        >
          {meta.excerpt.length > 100 ? meta.excerpt.slice(0, 100) + '\u2026' : meta.excerpt}
        </div>

        {/* Author + Date */}
        <div
          style={{
            display: 'flex',
            fontSize: 14,
            color: '#555555',
            fontWeight: 600,
          }}
        >
          {meta.author} &middot; {formattedDate}
        </div>

        {/* Reading time */}
        <div
          style={{
            display: 'flex',
            fontSize: 12,
            color: '#777777',
            marginTop: 6,
          }}
        >
          {meta.readingTime} min read
        </div>

        {/* Tags */}
        {meta.tags && (
          <div style={{ display: 'flex', marginTop: 8, gap: 12 }}>
            {meta.tags.slice(0, 3).map((tag) => (
              <div
                key={tag}
                style={{
                  display: 'flex',
                  fontSize: 11,
                  color: '#000000',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                }}
              >
                {tag.toUpperCase()}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top center white cell label */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 8,
          left: 327,
          width: 493,
          height: 172,
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 2,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 13,
            color: '#999999',
            letterSpacing: '0.25em',
            fontWeight: 600,
          }}
        >
          DE STIJL &middot; {new Date(meta.date + 'T00:00:00Z').getFullYear()}
        </div>
      </div>
    </div>,
    size,
  );
}
