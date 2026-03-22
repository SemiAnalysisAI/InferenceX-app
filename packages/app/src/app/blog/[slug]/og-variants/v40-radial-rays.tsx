/**
 * V40: Radial Rays — Thin lines radiating outward from the bottom center
 * like a sunrise. Gold/amber rays fanning upward on dark bg.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#0c0a08';
const RAY_COLOR_A = '#f59e0b12';
const RAY_COLOR_B = '#f59e0b08';
const GOLD = '#f59e0b';

// Generate rays from bottom center (600, 630) fanning out
// Each ray is a tall thin div positioned at bottom-center, rotated by offset
// Since transforms aren't reliable in Satori, we simulate with lines from origin to top
const originX = 600;
const originY = 630;
const rayCount = 30;

const rays: { endX: number; endY: number; color: string }[] = [];
for (let i = 0; i < rayCount; i++) {
  const angle = -Math.PI / 2 + ((i - rayCount / 2) / rayCount) * Math.PI * 0.9;
  const length = 800;
  rays.push({
    endX: originX + Math.cos(angle) * length,
    endY: originY + Math.sin(angle) * length,
    color: i % 3 === 0 ? RAY_COLOR_A : RAY_COLOR_B,
  });
}

// Approximate each ray as a very thin tall div — we use the horizontal/vertical decomposition
// For each ray, place a 1px-wide vertical div and a 1px-tall horizontal div
function raySegments(endX: number, endY: number, segments: number) {
  const segs: { left: number; top: number; width: number; height: number }[] = [];
  for (let s = 0; s < segments; s++) {
    const t = s / segments;
    const x = originX + (endX - originX) * t;
    const y = originY + (endY - originY) * t;
    const nextT = (s + 1) / segments;
    const nx = originX + (endX - originX) * nextT;
    const ny = originY + (endY - originY) * nextT;
    segs.push({
      left: Math.min(x, nx),
      top: Math.min(y, ny),
      width: Math.max(1, Math.abs(nx - x)),
      height: Math.max(1, Math.abs(ny - y)),
    });
  }
  return segs;
}

// For perf, use fewer segments per ray
const allSegments = rays.flatMap((ray, ri) =>
  raySegments(ray.endX, ray.endY, 20).map((seg) => ({ ...seg, color: ray.color, ri })),
);

// Limit total segments
const limitedSegments = allSegments.filter((_, i) => i % 2 === 0).slice(0, 200);

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
        color: '#fef3e0',
        padding: 60,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Ray segments */}
      {limitedSegments.map((seg, i) => (
        <div
          key={`r${i}`}
          style={{
            position: 'absolute',
            left: Math.round(seg.left),
            top: Math.round(seg.top),
            width: Math.round(seg.width),
            height: Math.round(seg.height),
            backgroundColor: seg.color,
            display: 'flex',
          }}
        />
      ))}

      {/* Glow at origin point */}
      <div
        style={{
          position: 'absolute',
          left: 500,
          bottom: -60,
          width: 200,
          height: 120,
          backgroundColor: '#f59e0b15',
          borderRadius: 100,
          display: 'flex',
        }}
      />

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
            color: '#c8a878',
            lineHeight: 1.4,
            maxHeight: 80,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', gap: 24, fontSize: 22, color: '#a88850', zIndex: 1 }}>
        <span style={{ fontWeight: 600, color: GOLD }}>{meta.author}</span>
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
