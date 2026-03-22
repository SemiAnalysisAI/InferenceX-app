/**
 * V29: Particle Burst — dots and short lines radiating outward from bottom-left corner.
 * Creates an energy/explosion feel with positioned elements fanning out.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

interface Particle {
  x: number;
  y: number;
  size: number;
  color: string;
  opacity: number;
}

interface Ray {
  x: number;
  y: number;
  length: number;
  angle: number;
  color: string;
  opacity: number;
}

function generateBurst() {
  const particles: Particle[] = [];
  const rays: Ray[] = [];
  const originX = -20;
  const originY = 660;
  const colors = ['#f97316', '#fb923c', '#fbbf24', '#f59e0b', '#ef4444', '#fcd34d'];

  for (let i = 0; i < 45; i++) {
    const angle = -Math.PI / 2 + (Math.random() * Math.PI) / 1.8 + 0.15;
    const dist = 80 + Math.random() * 700;
    const x = originX + Math.cos(angle) * dist;
    const y = originY + Math.sin(angle) * dist;
    const size = 4 + Math.random() * 14;
    const distRatio = dist / 780;
    particles.push({
      x,
      y,
      size,
      color: colors[i % colors.length],
      opacity: 0.2 + 0.6 * (1 - distRatio),
    });
  }

  for (let i = 0; i < 20; i++) {
    const angle = (-Math.PI / 2 + (Math.random() * Math.PI) / 1.8 + 0.15) * (180 / Math.PI);
    const dist = 50 + Math.random() * 500;
    const radAngle = (angle * Math.PI) / 180;
    const x = originX + Math.cos(radAngle) * dist;
    const y = originY + Math.sin(radAngle) * dist;
    const length = 20 + Math.random() * 60;
    rays.push({
      x,
      y,
      length,
      angle,
      color: colors[i % colors.length],
      opacity: 0.15 + Math.random() * 0.25,
    });
  }

  return { particles, rays };
}

const { particles: PARTICLES, rays: RAYS } = generateBurst();

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
        backgroundColor: '#18181b',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Glow at origin */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: -120,
          bottom: -120,
          width: 300,
          height: 300,
          borderRadius: 9999,
          backgroundColor: '#f97316',
          opacity: 0.12,
        }}
      />

      {/* Rays */}
      {RAYS.map((ray, i) => (
        <div
          key={`r-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: ray.x,
            top: ray.y,
            width: ray.length,
            height: 2,
            backgroundColor: ray.color,
            opacity: ray.opacity,
            transformOrigin: '0 0',
            transform: `rotate(${ray.angle}deg)`,
          }}
        />
      ))}

      {/* Particles */}
      {PARTICLES.map((p, i) => (
        <div
          key={`p-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: p.x - p.size / 2,
            top: p.y - p.size / 2,
            width: p.size,
            height: p.size,
            borderRadius: 9999,
            backgroundColor: p.color,
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
          <span style={{ color: '#fef3c7', fontSize: 22, marginLeft: 12, fontWeight: 600 }}>
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
              color: '#fefce8',
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#fcd34d',
              lineHeight: 1.5,
              opacity: 0.75,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ color: '#fb923c', fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#44403c', fontSize: 22 }}>\u00b7</span>
          <span style={{ color: '#a8a29e', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#44403c', fontSize: 22 }}>\u00b7</span>
          <span style={{ color: '#a8a29e', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
