/**
 * V79: Binary Accent — Strings of "01" scattered across the background in low opacity,
 * some horizontal, some vertical. Tech/crypto aesthetic with white and gold content.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

// Horizontal binary strings
const hLines = [
  { x: 20, y: 30, text: '01001101 10110010 01110001', opacity: 0.06 },
  { x: 300, y: 80, text: '11010011 01001110 10100101', opacity: 0.04 },
  { x: 50, y: 160, text: '10110100 01101001 11001010', opacity: 0.07 },
  { x: 600, y: 45, text: '01011010 10010111', opacity: 0.05 },
  { x: 800, y: 130, text: '11100110 01010011 10001101', opacity: 0.04 },
  { x: 100, y: 380, text: '01101110 10011001', opacity: 0.06 },
  { x: 700, y: 420, text: '10100011 01110100', opacity: 0.05 },
  { x: 20, y: 520, text: '01010110 11001011 10110001', opacity: 0.04 },
  { x: 500, y: 560, text: '11011001 01000110 10101110', opacity: 0.07 },
  { x: 900, y: 590, text: '01101010 10010011', opacity: 0.05 },
  { x: 400, y: 250, text: '10001110 01010101', opacity: 0.03 },
];

// Vertical binary columns
const vCols = [
  { x: 60, topY: 200, chars: '10110100', opacity: 0.05 },
  { x: 250, topY: 50, chars: '01101011', opacity: 0.04 },
  { x: 480, topY: 300, chars: '110010', opacity: 0.06 },
  { x: 750, topY: 100, chars: '01010110', opacity: 0.03 },
  { x: 1000, topY: 250, chars: '1001101', opacity: 0.05 },
  { x: 1130, topY: 40, chars: '01100101', opacity: 0.04 },
  { x: 150, topY: 400, chars: '10011', opacity: 0.06 },
  { x: 900, topY: 350, chars: '011010', opacity: 0.04 },
];

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        backgroundColor: '#0a0a0f',
        color: '#ffffff',
        padding: 60,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Horizontal binary strings */}
      {hLines.map((line, i) => (
        <div
          key={`h${i}`}
          style={{
            position: 'absolute',
            left: line.x,
            top: line.y,
            fontSize: 16,
            color: '#ffffff',
            opacity: line.opacity,
            display: 'flex',
            letterSpacing: 2,
          }}
        >
          {line.text}
        </div>
      ))}

      {/* Vertical binary columns */}
      {vCols.map((col, i) => (
        <div
          key={`v${i}`}
          style={{
            position: 'absolute',
            left: col.x,
            top: col.topY,
            display: 'flex',
            flexDirection: 'column',
            fontSize: 14,
            color: '#ffffff',
            opacity: col.opacity,
            lineHeight: 1.8,
          }}
        >
          {col.chars.split('').map((c, j) => (
            <span key={`vc${j}`} style={{ display: 'flex' }}>
              {c}
            </span>
          ))}
        </div>
      ))}

      {/* Subtle gold accent line */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1200,
          height: 3,
          backgroundColor: '#eab30840',
          display: 'flex',
        }}
      />

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', zIndex: 2 }}>
        <img src={logoSrc} height={32} />
      </div>

      {/* Title */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, zIndex: 2 }}>
        <div
          style={{
            fontSize: titleSize,
            fontWeight: 700,
            lineHeight: 1.2,
            color: '#ffffff',
            display: 'flex',
          }}
        >
          {meta.title}
        </div>
        <div
          style={{
            fontSize: 26,
            color: '#eab308',
            lineHeight: 1.4,
            maxHeight: 76,
            overflow: 'hidden',
            display: 'flex',
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '...' : meta.excerpt}
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', gap: 24, fontSize: 22, zIndex: 2 }}>
        <span style={{ color: '#ffffff', fontWeight: 600 }}>{meta.author}</span>
        <span style={{ color: '#eab30860' }}>|</span>
        <span style={{ color: '#eab308' }}>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
        <span style={{ color: '#eab30860' }}>|</span>
        <span style={{ color: '#a1a1aa' }}>{meta.readingTime} min read</span>
      </div>
    </div>,
    size,
  );
}
