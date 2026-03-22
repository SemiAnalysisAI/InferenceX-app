/**
 * V78: Matrix Rain — Dark green-black background with columns of characters/numbers
 * at varying opacities, evoking the classic digital rain effect. White content overlaid.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

// Each column is a vertical string of characters at a specific x position
const columns = [
  { x: 30, chars: '7F2A9B1D4E', opacity: 0.08 },
  { x: 80, chars: '01A3C8F5B2', opacity: 0.12 },
  { x: 140, chars: '9D7E3A0C6F', opacity: 0.06 },
  { x: 200, chars: 'B4F1C8A02E', opacity: 0.15 },
  { x: 260, chars: '3A7D9F1B5C', opacity: 0.07 },
  { x: 330, chars: '8E2C6A0F4D', opacity: 0.1 },
  { x: 390, chars: 'F5B3D7A1C9', opacity: 0.05 },
  { x: 450, chars: '2E8A4F0C6B', opacity: 0.13 },
  { x: 520, chars: 'D1C7F3A9B5', opacity: 0.06 },
  { x: 580, chars: '6A0E4C8F2D', opacity: 0.09 },
  { x: 650, chars: 'B9D3F7A1C5', opacity: 0.14 },
  { x: 710, chars: '4E8A0C6F2B', opacity: 0.07 },
  { x: 780, chars: 'A3D9F5B1C7', opacity: 0.11 },
  { x: 840, chars: '0E6A4C8F2D', opacity: 0.05 },
  { x: 910, chars: 'F7B3D1A9C5', opacity: 0.12 },
  { x: 970, chars: '2E8A4F0C6B', opacity: 0.08 },
  { x: 1040, chars: '9D3F7A1C5B', opacity: 0.1 },
  { x: 1100, chars: '4E8A0C6F2D', opacity: 0.06 },
  { x: 1160, chars: 'B1C7F3A9D5', opacity: 0.09 },
];

// Bright "lead" characters at various positions
const brightChars = [
  { x: 80, y: 120, char: 'A', opacity: 0.6 },
  { x: 200, y: 280, char: '7', opacity: 0.5 },
  { x: 450, y: 90, char: 'F', opacity: 0.7 },
  { x: 650, y: 400, char: '3', opacity: 0.55 },
  { x: 910, y: 200, char: 'C', opacity: 0.65 },
  { x: 1040, y: 480, char: '9', opacity: 0.5 },
  { x: 330, y: 520, char: 'E', opacity: 0.45 },
  { x: 780, y: 60, char: '1', opacity: 0.6 },
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
        backgroundColor: '#050d05',
        color: '#ffffff',
        padding: 60,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Matrix rain columns */}
      {columns.map((col, i) => (
        <div
          key={`col${i}`}
          style={{
            position: 'absolute',
            left: col.x,
            top: 0,
            display: 'flex',
            flexDirection: 'column',
            fontSize: 18,
            color: '#00ff41',
            opacity: col.opacity,
            lineHeight: 1.6,
          }}
        >
          {col.chars.split('').map((c, j) => (
            <span key={`c${j}`} style={{ display: 'flex' }}>
              {c}
            </span>
          ))}
        </div>
      ))}

      {/* Bright lead characters */}
      {brightChars.map((bc, i) => (
        <div
          key={`bc${i}`}
          style={{
            position: 'absolute',
            left: bc.x,
            top: bc.y,
            fontSize: 22,
            color: '#00ff41',
            opacity: bc.opacity,
            display: 'flex',
          }}
        >
          {bc.char}
        </div>
      ))}

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
            color: '#a0d8a0',
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
      <div style={{ display: 'flex', gap: 24, fontSize: 22, color: '#00ff41', zIndex: 2 }}>
        <span style={{ fontWeight: 600 }}>{meta.author}</span>
        <span style={{ color: '#00ff4160' }}>|</span>
        <span>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
        <span style={{ color: '#00ff4160' }}>|</span>
        <span>{meta.readingTime} min read</span>
      </div>
    </div>,
    size,
  );
}
