/**
 * V35: Corner Arcs — quarter-circle arcs in each corner of the image.
 * Different sizes and colors per corner creating a framing effect with content centered.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

interface CornerArc {
  corner: 'tl' | 'tr' | 'bl' | 'br';
  radius: number;
  color: string;
  opacity: number;
  borderWidth: number;
}

const ARCS: CornerArc[] = [
  // Top-left corner — rose/pink arcs
  { corner: 'tl', radius: 180, color: '#f43f5e', opacity: 0.35, borderWidth: 2.5 },
  { corner: 'tl', radius: 130, color: '#fb7185', opacity: 0.25, borderWidth: 2 },
  { corner: 'tl', radius: 80, color: '#fda4af', opacity: 0.18, borderWidth: 1.5 },

  // Top-right corner — cyan arcs
  { corner: 'tr', radius: 220, color: '#06b6d4', opacity: 0.3, borderWidth: 2.5 },
  { corner: 'tr', radius: 160, color: '#22d3ee', opacity: 0.22, borderWidth: 2 },
  { corner: 'tr', radius: 100, color: '#67e8f9', opacity: 0.15, borderWidth: 1.5 },

  // Bottom-left corner — amber arcs
  { corner: 'bl', radius: 200, color: '#f59e0b', opacity: 0.3, borderWidth: 2.5 },
  { corner: 'bl', radius: 140, color: '#fbbf24', opacity: 0.2, borderWidth: 2 },

  // Bottom-right corner — violet arcs
  { corner: 'br', radius: 160, color: '#8b5cf6', opacity: 0.35, borderWidth: 2.5 },
  { corner: 'br', radius: 110, color: '#a78bfa', opacity: 0.25, borderWidth: 2 },
  { corner: 'br', radius: 60, color: '#c4b5fd', opacity: 0.18, borderWidth: 1.5 },
];

function getArcPosition(arc: CornerArc) {
  const d = arc.radius * 2;
  switch (arc.corner) {
    case 'tl':
      return { left: -arc.radius, top: -arc.radius, width: d, height: d };
    case 'tr':
      return { left: 1200 - arc.radius, top: -arc.radius, width: d, height: d };
    case 'bl':
      return { left: -arc.radius, top: 630 - arc.radius, width: d, height: d };
    case 'br':
      return { left: 1200 - arc.radius, top: 630 - arc.radius, width: d, height: d };
  }
}

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
        backgroundColor: '#111827',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Corner arcs */}
      {ARCS.map((arc, i) => {
        const pos = getArcPosition(arc);
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              position: 'absolute',
              left: pos.left,
              top: pos.top,
              width: pos.width,
              height: pos.height,
              borderRadius: 9999,
              border: `${arc.borderWidth}px solid ${arc.color}`,
              opacity: arc.opacity,
            }}
          />
        );
      })}

      {/* Corner accent dots */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 12,
          top: 12,
          width: 8,
          height: 8,
          borderRadius: 9999,
          backgroundColor: '#f43f5e',
          opacity: 0.6,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: 12,
          top: 12,
          width: 8,
          height: 8,
          borderRadius: 9999,
          backgroundColor: '#06b6d4',
          opacity: 0.6,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 12,
          bottom: 12,
          width: 8,
          height: 8,
          borderRadius: 9999,
          backgroundColor: '#f59e0b',
          opacity: 0.6,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: 12,
          bottom: 12,
          width: 8,
          height: 8,
          borderRadius: 9999,
          backgroundColor: '#8b5cf6',
          opacity: 0.6,
        }}
      />

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '52px 64px',
          width: '100%',
          height: '100%',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} width={44} height={44} />
          <span style={{ color: '#e5e7eb', fontSize: 22, marginLeft: 12, fontWeight: 600 }}>
            InferenceX
          </span>
        </div>

        {/* Title & excerpt */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            maxWidth: 860,
            alignItems: 'center',
            alignSelf: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 800,
              color: '#f9fafb',
              lineHeight: 1.15,
              textAlign: 'center',
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#9ca3af',
              lineHeight: 1.5,
              textAlign: 'center',
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <span style={{ color: '#a78bfa', fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#374151', fontSize: 22 }}>\u00b7</span>
          <span style={{ color: '#6b7280', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#374151', fontSize: 22 }}>\u00b7</span>
          <span style={{ color: '#6b7280', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
