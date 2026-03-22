/**
 * V152: Aurora — Very dark bg with layered horizontal bands of green, purple,
 * and blue at low opacity creating a northern lights curtain effect. Scattered
 * star dots. Content at bottom.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#050812';

// Aurora curtain bands — positioned at the top, varying widths and colors
const auroraBands: {
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
}[] = [
  // Green layer
  { left: 0, top: 20, width: 400, height: 120, color: '#00ff8010' },
  { left: 200, top: 40, width: 350, height: 140, color: '#00ff8018' },
  { left: 500, top: 10, width: 300, height: 100, color: '#00ff800c' },
  { left: 750, top: 30, width: 450, height: 130, color: '#00ff8014' },
  // Purple layer
  { left: 100, top: 60, width: 380, height: 110, color: '#8b00ff12' },
  { left: 400, top: 50, width: 300, height: 130, color: '#8b00ff0e' },
  { left: 700, top: 70, width: 350, height: 100, color: '#8b00ff10' },
  { left: 950, top: 40, width: 250, height: 120, color: '#8b00ff0c' },
  // Blue layer
  { left: 50, top: 100, width: 320, height: 90, color: '#0066ff0e' },
  { left: 300, top: 90, width: 400, height: 110, color: '#0066ff12' },
  { left: 650, top: 110, width: 300, height: 80, color: '#0066ff0a' },
  { left: 900, top: 80, width: 300, height: 100, color: '#0066ff10' },
];

// Stars scattered across the sky
const auroraStars: { x: number; y: number; size: number; opacity: number }[] = [
  { x: 60, y: 30, size: 2, opacity: 0.4 },
  { x: 180, y: 80, size: 1, opacity: 0.3 },
  { x: 300, y: 20, size: 3, opacity: 0.6 },
  { x: 420, y: 60, size: 1, opacity: 0.25 },
  { x: 540, y: 40, size: 2, opacity: 0.5 },
  { x: 650, y: 90, size: 1, opacity: 0.3 },
  { x: 770, y: 25, size: 2, opacity: 0.45 },
  { x: 880, y: 70, size: 3, opacity: 0.55 },
  { x: 1000, y: 35, size: 1, opacity: 0.3 },
  { x: 1100, y: 85, size: 2, opacity: 0.4 },
  { x: 120, y: 150, size: 1, opacity: 0.2 },
  { x: 350, y: 170, size: 2, opacity: 0.35 },
  { x: 580, y: 140, size: 1, opacity: 0.2 },
  { x: 810, y: 160, size: 2, opacity: 0.3 },
  { x: 1040, y: 145, size: 1, opacity: 0.25 },
  { x: 250, y: 210, size: 1, opacity: 0.15 },
  { x: 700, y: 220, size: 2, opacity: 0.2 },
  { x: 950, y: 200, size: 1, opacity: 0.15 },
  { x: 450, y: 250, size: 1, opacity: 0.1 },
  { x: 1100, y: 240, size: 1, opacity: 0.12 },
];

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        width: '100%',
        height: '100%',
        backgroundColor: BG,
        color: '#e0eaff',
        padding: 60,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Aurora bands */}
      {auroraBands.map((band, i) => (
        <div
          key={`ab${i}`}
          style={{
            position: 'absolute',
            left: band.left,
            top: band.top,
            width: band.width,
            height: band.height,
            backgroundColor: band.color,
            borderRadius: 80,
            display: 'flex',
          }}
        />
      ))}

      {/* Stars */}
      {auroraStars.map((s, i) => (
        <div
          key={`st${i}`}
          style={{
            position: 'absolute',
            left: s.x,
            top: s.y,
            width: s.size,
            height: s.size,
            borderRadius: s.size / 2,
            backgroundColor: '#ffffff',
            opacity: s.opacity,
            display: 'flex',
          }}
        />
      ))}

      {/* Horizon glow */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 200,
          width: 1200,
          height: 80,
          backgroundColor: '#00ff8006',
          display: 'flex',
        }}
      />

      {/* Silhouette line at bottom (treeline/mountains) */}
      {[
        { left: 0, width: 160, height: 35 },
        { left: 130, width: 120, height: 50 },
        { left: 220, width: 180, height: 30 },
        { left: 370, width: 140, height: 45 },
        { left: 480, width: 200, height: 28 },
        { left: 650, width: 130, height: 42 },
        { left: 750, width: 180, height: 35 },
        { left: 900, width: 150, height: 48 },
        { left: 1020, width: 180, height: 32 },
      ].map((tree, i) => (
        <div
          key={`tr${i}`}
          style={{
            position: 'absolute',
            left: tree.left,
            bottom: 230,
            width: tree.width,
            height: tree.height,
            backgroundColor: '#080c15',
            borderRadius: '4px 4px 0 0',
            display: 'flex',
          }}
        />
      ))}

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', zIndex: 1, marginBottom: 24 }}>
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
            color: '#6080a0',
            lineHeight: 1.4,
            maxHeight: 80,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          gap: 24,
          fontSize: 22,
          color: '#506888',
          zIndex: 1,
          marginTop: 20,
        }}
      >
        <span style={{ fontWeight: 600, color: '#00ff80' }}>{meta.author}</span>
        <span>{'\u00b7'}</span>
        <span>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
        <span>{'\u00b7'}</span>
        <span>{meta.readingTime} min read</span>
        {meta.tags &&
          meta.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              style={{
                backgroundColor: '#0a1020',
                padding: '4px 12px',
                borderRadius: 9999,
                fontSize: 18,
                color: '#00ff80',
              }}
            >
              {tag}
            </span>
          ))}
      </div>
    </div>,
    size,
  );
}
