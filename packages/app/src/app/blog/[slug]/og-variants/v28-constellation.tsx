/**
 * V28: Constellation — dots connected by thin lines creating a star-map effect.
 * Dark navy background with white and ice-blue dots and connecting lines.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

interface Star {
  x: number;
  y: number;
  size: number;
  bright: boolean;
}

interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length: number;
  angle: number;
}

function generateConstellation() {
  const stars: Star[] = [
    { x: 80, y: 60, size: 5, bright: true },
    { x: 220, y: 120, size: 3, bright: false },
    { x: 150, y: 230, size: 4, bright: true },
    { x: 350, y: 80, size: 3, bright: false },
    { x: 450, y: 180, size: 6, bright: true },
    { x: 600, y: 60, size: 4, bright: false },
    { x: 700, y: 140, size: 5, bright: true },
    { x: 850, y: 50, size: 3, bright: false },
    { x: 950, y: 120, size: 4, bright: true },
    { x: 1100, y: 80, size: 5, bright: false },
    { x: 1050, y: 200, size: 3, bright: true },
    { x: 900, y: 250, size: 4, bright: false },
    { x: 130, y: 450, size: 3, bright: false },
    { x: 280, y: 520, size: 5, bright: true },
    { x: 420, y: 480, size: 4, bright: false },
    { x: 560, y: 550, size: 3, bright: true },
    { x: 750, y: 500, size: 5, bright: false },
    { x: 900, y: 560, size: 4, bright: true },
    { x: 1050, y: 480, size: 3, bright: false },
    { x: 1150, y: 550, size: 4, bright: true },
    { x: 50, y: 350, size: 3, bright: false },
    { x: 1140, y: 320, size: 4, bright: true },
    { x: 500, y: 40, size: 3, bright: true },
    { x: 780, y: 580, size: 3, bright: false },
  ];

  const connections: [number, number][] = [
    [0, 1],
    [1, 2],
    [1, 3],
    [3, 4],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 8],
    [8, 9],
    [9, 10],
    [10, 11],
    [6, 11],
    [12, 13],
    [13, 14],
    [14, 15],
    [15, 16],
    [16, 17],
    [17, 18],
    [18, 19],
    [2, 12],
    [4, 14],
    [11, 21],
    [0, 20],
    [5, 22],
    [17, 23],
  ];

  const lines: Line[] = connections.map(([a, b]) => {
    const dx = stars[b].x - stars[a].x;
    const dy = stars[b].y - stars[a].y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    return { x1: stars[a].x, y1: stars[a].y, x2: stars[b].x, y2: stars[b].y, length, angle };
  });

  return { stars, lines };
}

const { stars: STARS, lines: LINES } = generateConstellation();

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0a0e27',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Connecting lines */}
      {LINES.map((line, i) => (
        <div
          key={`l-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: line.x1,
            top: line.y1,
            width: line.length,
            height: 1,
            backgroundColor: '#bfdbfe',
            opacity: 0.15,
            transformOrigin: '0 0',
            transform: `rotate(${line.angle}deg)`,
          }}
        />
      ))}

      {/* Stars */}
      {STARS.map((star, i) => (
        <div
          key={`s-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: star.x - star.size / 2,
            top: star.y - star.size / 2,
            width: star.size,
            height: star.size,
            borderRadius: 9999,
            backgroundColor: star.bright ? '#e0f2fe' : '#93c5fd',
            opacity: star.bright ? 0.9 : 0.5,
          }}
        />
      ))}

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '48px 56px',
          width: '100%',
          height: '100%',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} width={44} height={44} />
          <span style={{ color: '#bfdbfe', fontSize: 22, marginLeft: 12, fontWeight: 600 }}>
            InferenceX
          </span>
        </div>

        {/* Title & excerpt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 880 }}>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 800,
              color: '#f0f9ff',
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#7dd3fc',
              lineHeight: 1.5,
              opacity: 0.8,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ color: '#7dd3fc', fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#1e3a5f', fontSize: 22 }}>\u00b7</span>
          <span style={{ color: '#64748b', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#1e3a5f', fontSize: 22 }}>\u00b7</span>
          <span style={{ color: '#64748b', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
