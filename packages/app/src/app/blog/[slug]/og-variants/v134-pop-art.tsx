/**
 * V134: Pop Art — Four-quadrant Warhol-inspired layout with hot pink, electric blue, lime, and yellow panels. Title repeated in different colors with halftone dots.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const formattedDate = new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

  // Truncate title for quadrants
  const shortTitle = meta.title.length > 50 ? meta.title.slice(0, 47) + '...' : meta.title;
  const quadrantTitleSize = shortTitle.length > 40 ? 24 : shortTitle.length > 25 ? 28 : 32;

  // Quadrant configs
  const quadrants = [
    { bg: '#ff1493', textColor: '#ffd700', x: 0, y: 0, dotColor: '#ffffff' },
    { bg: '#00bfff', textColor: '#ff1493', x: 600, y: 0, dotColor: '#000000' },
    { bg: '#32cd32', textColor: '#00bfff', x: 0, y: 315, dotColor: '#ffffff' },
    { bg: '#ffd700', textColor: '#32cd32', x: 600, y: 315, dotColor: '#000000' },
  ];

  // Halftone dot patterns for each corner
  const halftonePositions = [
    // Top-left quadrant corner dots
    [
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 50, y: 10 },
      { x: 70, y: 10 },
      { x: 10, y: 30 },
      { x: 30, y: 30 },
      { x: 50, y: 30 },
      { x: 10, y: 50 },
      { x: 30, y: 50 },
      { x: 10, y: 70 },
    ],
    // Top-right quadrant corner dots
    [
      { x: 520, y: 10 },
      { x: 540, y: 10 },
      { x: 560, y: 10 },
      { x: 580, y: 10 },
      { x: 540, y: 30 },
      { x: 560, y: 30 },
      { x: 580, y: 30 },
      { x: 560, y: 50 },
      { x: 580, y: 50 },
      { x: 580, y: 70 },
    ],
    // Bottom-left quadrant corner dots
    [
      { x: 10, y: 245 },
      { x: 30, y: 245 },
      { x: 50, y: 245 },
      { x: 70, y: 245 },
      { x: 10, y: 265 },
      { x: 30, y: 265 },
      { x: 50, y: 265 },
      { x: 10, y: 285 },
      { x: 30, y: 285 },
      { x: 10, y: 305 },
    ],
    // Bottom-right quadrant corner dots
    [
      { x: 520, y: 245 },
      { x: 540, y: 245 },
      { x: 560, y: 245 },
      { x: 580, y: 245 },
      { x: 540, y: 265 },
      { x: 560, y: 265 },
      { x: 580, y: 265 },
      { x: 560, y: 285 },
      { x: 580, y: 285 },
      { x: 580, y: 305 },
    ],
  ];

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#000000',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Four quadrants */}
      {quadrants.map((q, qi) => (
        <div
          key={qi}
          style={{
            display: 'flex',
            flexDirection: 'column',
            position: 'absolute',
            top: q.y,
            left: q.x,
            width: 600,
            height: 315,
            backgroundColor: q.bg,
            padding: '30px 35px',
          }}
        >
          {/* Halftone dots in corner */}
          {halftonePositions[qi].map((dot, di) => (
            <div
              key={di}
              style={{
                display: 'flex',
                position: 'absolute',
                top: qi < 2 ? dot.y : dot.y,
                left: dot.x,
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: q.dotColor,
                opacity: 0.12,
              }}
            />
          ))}

          {/* Title in this quadrant */}
          <div
            style={{
              display: 'flex',
              fontSize: quadrantTitleSize,
              fontWeight: 900,
              color: q.textColor,
              lineHeight: 1.2,
              marginTop: qi < 2 ? 60 : 20,
              maxWidth: 500,
            }}
          >
            {shortTitle}
          </div>

          {/* Spacer */}
          <div style={{ display: 'flex', flex: 1 }} />

          {/* Quadrant label */}
          <div
            style={{
              display: 'flex',
              fontSize: 12,
              fontWeight: 800,
              color: q.textColor,
              opacity: 0.6,
              letterSpacing: '0.1em',
            }}
          >
            {qi === 0
              ? 'INFERENCEX'
              : qi === 1
                ? meta.author.toUpperCase()
                : qi === 2
                  ? formattedDate.toUpperCase()
                  : `${meta.readingTime} MIN READ`}
          </div>
        </div>
      ))}

      {/* Thick black cross dividers */}
      {/* Vertical divider */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 597,
          width: 6,
          height: 630,
          backgroundColor: '#000000',
          zIndex: 5,
        }}
      />
      {/* Horizontal divider */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 312,
          left: 0,
          width: 1200,
          height: 6,
          backgroundColor: '#000000',
          zIndex: 5,
        }}
      />

      {/* Center logo badge */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 285,
          left: 570,
          width: 60,
          height: 60,
          borderRadius: 30,
          backgroundColor: '#000000',
          border: '3px solid #ffffff',
          zIndex: 10,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img src={logoSrc} width={30} height={30} />
      </div>

      {/* Tags across the bottom center */}
      {meta.tags && (
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: 10,
            left: 0,
            right: 0,
            justifyContent: 'center',
            gap: 16,
            zIndex: 10,
          }}
        >
          {meta.tags.slice(0, 4).map((tag, i) => (
            <div
              key={tag}
              style={{
                display: 'flex',
                fontSize: 11,
                fontWeight: 800,
                color: '#000000',
                backgroundColor: quadrants[i % 4].bg,
                padding: '3px 10px',
                borderRadius: 2,
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
