/**
 * V37: Vertical Blinds — Alternating vertical bars of slightly different shades,
 * like window blinds. Subtle background texture with varying stripe widths.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#1a1a2e';

// Vertical blinds with varying widths and alternating shades
const blinds = [
  { left: 0, width: 55, color: '#1e1e34' },
  { left: 55, width: 70, color: '#22223a' },
  { left: 125, width: 45, color: '#1c1c30' },
  { left: 170, width: 80, color: '#24243e' },
  { left: 250, width: 50, color: '#1e1e34' },
  { left: 300, width: 65, color: '#20203a' },
  { left: 365, width: 75, color: '#1c1c32' },
  { left: 440, width: 40, color: '#262642' },
  { left: 480, width: 60, color: '#1e1e36' },
  { left: 540, width: 70, color: '#22223c' },
  { left: 610, width: 55, color: '#1a1a30' },
  { left: 665, width: 80, color: '#24243e' },
  { left: 745, width: 45, color: '#202038' },
  { left: 790, width: 65, color: '#1c1c34' },
  { left: 855, width: 50, color: '#262640' },
  { left: 905, width: 75, color: '#1e1e36' },
  { left: 980, width: 60, color: '#22223a' },
  { left: 1040, width: 45, color: '#1c1c32' },
  { left: 1085, width: 70, color: '#24243e' },
  { left: 1155, width: 45, color: '#202038' },
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
        backgroundColor: BG,
        color: '#f0f0f8',
        padding: 60,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Vertical blinds */}
      {blinds.map((b, i) => (
        <div
          key={`b${i}`}
          style={{
            position: 'absolute',
            left: b.left,
            top: 0,
            width: b.width,
            height: 630,
            backgroundColor: b.color,
            display: 'flex',
          }}
        />
      ))}

      {/* Thin separator lines between blinds */}
      {blinds.map((b, i) => (
        <div
          key={`s${i}`}
          style={{
            position: 'absolute',
            left: b.left,
            top: 0,
            width: 1,
            height: 630,
            backgroundColor: '#ffffff06',
            display: 'flex',
          }}
        />
      ))}

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', zIndex: 1 }}>
        <img src={logoSrc} height={32} />
      </div>

      {/* Title + excerpt */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, zIndex: 1 }}>
        <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.2, color: '#ffffff' }}>
          {meta.title}
        </div>
        <div
          style={{
            fontSize: 26,
            color: '#a0a0b8',
            lineHeight: 1.4,
            maxHeight: 80,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', gap: 24, fontSize: 22, color: '#9090b0', zIndex: 1 }}>
        <span style={{ fontWeight: 600, color: '#c0c0d8' }}>{meta.author}</span>
        <span>{'\u00b7'}</span>
        <span>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
      </div>
    </div>,
    size,
  );
}
