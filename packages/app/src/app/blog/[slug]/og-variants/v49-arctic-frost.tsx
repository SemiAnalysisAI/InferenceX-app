/**
 * V49: Arctic Frost — very dark blue-grey bg with light icy accents.
 * Scattered small crystalline shapes (thin bordered diamonds/squares). Clean, cold, premium.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#0d1117';
const ICE_LIGHT = '#e0f2ff';
const ICE_MID = '#b3d9ff';
const ICE_DIM = '#6ba3cc';

// Crystalline shapes — thin bordered squares scattered across the image
const crystals: {
  x: number;
  y: number;
  size: number;
  borderColor: string;
  opacity: number;
  borderWidth: number;
}[] = [
  { x: 80, y: 50, size: 24, borderColor: ICE_LIGHT, opacity: 0.15, borderWidth: 1 },
  { x: 150, y: 180, size: 16, borderColor: ICE_MID, opacity: 0.12, borderWidth: 1 },
  { x: 60, y: 320, size: 20, borderColor: ICE_LIGHT, opacity: 0.1, borderWidth: 1 },
  { x: 200, y: 450, size: 14, borderColor: ICE_MID, opacity: 0.08, borderWidth: 1 },
  { x: 1020, y: 40, size: 28, borderColor: ICE_LIGHT, opacity: 0.14, borderWidth: 1 },
  { x: 1100, y: 160, size: 18, borderColor: ICE_MID, opacity: 0.1, borderWidth: 1 },
  { x: 950, y: 280, size: 22, borderColor: ICE_LIGHT, opacity: 0.12, borderWidth: 1 },
  { x: 1060, y: 400, size: 15, borderColor: ICE_MID, opacity: 0.08, borderWidth: 1 },
  { x: 1150, y: 320, size: 12, borderColor: ICE_LIGHT, opacity: 0.06, borderWidth: 1 },
  { x: 500, y: 30, size: 10, borderColor: ICE_MID, opacity: 0.07, borderWidth: 1 },
  { x: 700, y: 580, size: 12, borderColor: ICE_LIGHT, opacity: 0.06, borderWidth: 1 },
  { x: 350, y: 570, size: 16, borderColor: ICE_MID, opacity: 0.08, borderWidth: 1 },
];

// Small ice particle dots
const iceParticles = [
  { x: 120, y: 100, size: 3, opacity: 0.18 },
  { x: 300, y: 60, size: 2, opacity: 0.12 },
  { x: 1080, y: 90, size: 3, opacity: 0.15 },
  { x: 900, y: 200, size: 2, opacity: 0.1 },
  { x: 180, y: 400, size: 2, opacity: 0.08 },
  { x: 1000, y: 500, size: 3, opacity: 0.1 },
  { x: 600, y: 20, size: 2, opacity: 0.06 },
  { x: 850, y: 590, size: 2, opacity: 0.05 },
];

// Thin horizontal frost lines
const frostLines = [
  { top: 0, left: 0, width: 1200, height: 1, opacity: 0.15 },
  { top: 629, left: 0, width: 1200, height: 1, opacity: 0.15 },
  { top: 160, left: 0, width: 80, height: 1, opacity: 0.08 },
  { top: 160, left: 1120, width: 80, height: 1, opacity: 0.08 },
  { top: 470, left: 0, width: 60, height: 1, opacity: 0.06 },
  { top: 470, left: 1140, width: 60, height: 1, opacity: 0.06 },
];

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
        backgroundColor: BG,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Frost lines */}
      {frostLines.map((line, i) => (
        <div
          key={`fl${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: line.top,
            left: line.left,
            width: line.width,
            height: line.height,
            backgroundColor: ICE_LIGHT,
            opacity: line.opacity,
          }}
        />
      ))}

      {/* Crystalline bordered squares */}
      {crystals.map((c, i) => (
        <div
          key={`c${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: c.x,
            top: c.y,
            width: c.size,
            height: c.size,
            border: `${c.borderWidth}px solid ${c.borderColor}`,
            opacity: c.opacity,
          }}
        />
      ))}

      {/* Ice particles */}
      {iceParticles.map((p, i) => (
        <div
          key={`ip${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size,
            borderRadius: 9999,
            backgroundColor: ICE_LIGHT,
            opacity: p.opacity,
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
          <span style={{ color: ICE_LIGHT, fontSize: 22, marginLeft: 14, fontWeight: 600 }}>
            InferenceX
          </span>
        </div>

        {/* Title & excerpt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 800,
              color: '#f0f8ff',
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: ICE_DIM,
              lineHeight: 1.5,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{ color: ICE_MID, fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#2a4055', fontSize: 18 }}>/</span>
          <span style={{ color: ICE_DIM, fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#2a4055', fontSize: 18 }}>/</span>
          <span style={{ color: ICE_DIM, fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
