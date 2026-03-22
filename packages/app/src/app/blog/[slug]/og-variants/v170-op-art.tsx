/**
 * V170: Op Art — Bridget Riley / Vasarely optical illusion with concentric rings and alternating black/white stripes creating a vibrating moiré effect.
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

  // Concentric rings from center — alternating black and white
  const rings = Array.from({ length: 40 }, (_, i) => {
    const outerRadius = 500 - i * 12;
    if (outerRadius <= 0) return null;
    return {
      size: outerRadius * 2,
      radius: outerRadius,
      color: i % 2 === 0 ? '#000000' : '#ffffff',
    };
  }).filter(Boolean) as { size: number; radius: number; color: string }[];

  // Second set of concentric rings offset to create moiré
  const rings2 = Array.from({ length: 35 }, (_, i) => {
    const outerRadius = 420 - i * 11;
    if (outerRadius <= 0) return null;
    return {
      size: outerRadius * 2,
      radius: outerRadius,
      color: i % 2 === 0 ? '#000000' : '#ffffff',
    };
  }).filter(Boolean) as { size: number; radius: number; color: string }[];

  // Vertical stripes on left side for additional optical interference
  const stripes = Array.from({ length: 60 }, (_, i) => ({
    left: i * 4,
    color: i % 2 === 0 ? '#000000' : '#ffffff',
  }));

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0a0a0a',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Vertical stripes — left portion */}
      {stripes.map((s, i) => (
        <div
          key={`s${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: 0,
            left: s.left,
            width: 2,
            height: '100%',
            backgroundColor: s.color,
            opacity: 0.15,
          }}
        />
      ))}

      {/* Primary concentric rings — centered */}
      {rings.map((ring, i) => (
        <div
          key={`r1-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: 315 - ring.radius,
            left: 600 - ring.radius,
            width: ring.size,
            height: ring.size,
            borderRadius: ring.radius,
            backgroundColor: ring.color,
            opacity: 0.6,
          }}
        />
      ))}

      {/* Secondary concentric rings — offset for moiré */}
      {rings2.map((ring, i) => (
        <div
          key={`r2-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            top: 340 - ring.radius,
            left: 630 - ring.radius,
            width: ring.size,
            height: ring.size,
            borderRadius: ring.radius,
            backgroundColor: ring.color,
            opacity: 0.35,
          }}
        />
      ))}

      {/* Clear central zone for content */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 165,
          left: 350,
          width: 500,
          height: 300,
          backgroundColor: '#0a0a0a',
          borderRadius: 12,
          zIndex: 5,
        }}
      />
      {/* Inner border ring */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 163,
          left: 348,
          width: 504,
          height: 304,
          border: '2px solid #ffffff',
          borderRadius: 14,
          zIndex: 6,
          opacity: 0.3,
        }}
      />

      {/* Content area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          top: 175,
          left: 370,
          width: 460,
          height: 280,
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <img src={logoSrc} width={26} height={26} />
          <span
            style={{
              marginLeft: 8,
              fontSize: 14,
              fontWeight: 700,
              color: '#ffffff',
              letterSpacing: '0.15em',
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
            fontWeight: 800,
            color: '#ffffff',
            lineHeight: 1.2,
            textAlign: 'center',
            justifyContent: 'center',
          }}
        >
          {meta.title}
        </div>

        {/* Excerpt */}
        <div
          style={{
            display: 'flex',
            fontSize: 15,
            color: '#aaaaaa',
            lineHeight: 1.4,
            textAlign: 'center',
            marginTop: 12,
            justifyContent: 'center',
            maxWidth: 400,
          }}
        >
          {meta.excerpt.length > 100 ? meta.excerpt.slice(0, 100) + '\u2026' : meta.excerpt}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            fontSize: 13,
            color: '#888888',
            marginTop: 14,
          }}
        >
          {meta.author} &middot; {formattedDate} &middot; {meta.readingTime} min
        </div>

        {/* Tags */}
        {meta.tags && (
          <div style={{ display: 'flex', marginTop: 8, gap: 12 }}>
            {meta.tags.slice(0, 3).map((tag) => (
              <div
                key={tag}
                style={{
                  display: 'flex',
                  fontSize: 10,
                  color: '#666666',
                  letterSpacing: '0.15em',
                  fontWeight: 600,
                }}
              >
                {tag.toUpperCase()}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* "OP ART" watermark in corner */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 12,
          right: 20,
          fontSize: 11,
          color: '#ffffff',
          opacity: 0.15,
          letterSpacing: '0.3em',
          zIndex: 10,
        }}
      >
        OP ART
      </div>
    </div>,
    size,
  );
}
