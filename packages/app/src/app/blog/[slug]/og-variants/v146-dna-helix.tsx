/**
 * V146: DNA Helix — Dark bg with two intertwined strands of positioned dots
 * connected by horizontal rungs, alternating cyan and magenta. Bio-tech aesthetic.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#0a0c14';
const CYAN = '#00d4ff';
const MAGENTA = '#ff00aa';
const RUNG = '#ffffff12';

// Generate helix dots: two strands oscillating in opposition
function makeHelixDots(): {
  dots: { x: number; y: number; color: string; size: number }[];
  rungs: { x1: number; x2: number; y: number }[];
} {
  const dots: { x: number; y: number; color: string; size: number }[] = [];
  const rungs: { x1: number; x2: number; y: number }[] = [];
  const centerX = 160;
  const amplitude = 60;
  const steps = 22;

  for (let i = 0; i < steps; i++) {
    const y = 20 + (i / steps) * 600;
    const phase = (i / steps) * Math.PI * 4;
    const x1 = centerX + Math.sin(phase) * amplitude;
    const x2 = centerX + Math.sin(phase + Math.PI) * amplitude;

    dots.push({ x: x1, y, color: i % 2 === 0 ? CYAN : MAGENTA, size: 8 });
    dots.push({ x: x2, y, color: i % 2 === 0 ? MAGENTA : CYAN, size: 8 });

    // Rungs between the two strands
    if (i % 2 === 0) {
      rungs.push({ x1: Math.min(x1, x2), x2: Math.max(x1, x2), y });
    }
  }

  return { dots, rungs };
}

const helix = makeHelixDots();

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: BG,
        color: '#f0f4ff',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Helix rungs */}
      {helix.rungs.map((r, i) => (
        <div
          key={`r${i}`}
          style={{
            position: 'absolute',
            left: r.x1,
            top: r.y,
            width: r.x2 - r.x1,
            height: 1,
            backgroundColor: RUNG,
            display: 'flex',
          }}
        />
      ))}

      {/* Helix dots */}
      {helix.dots.map((d, i) => (
        <div
          key={`d${i}`}
          style={{
            position: 'absolute',
            left: d.x - d.size / 2,
            top: d.y - d.size / 2,
            width: d.size,
            height: d.size,
            borderRadius: d.size / 2,
            backgroundColor: d.color,
            opacity: 0.85,
            display: 'flex',
          }}
        />
      ))}

      {/* Strand connecting lines — strand 1 */}
      {helix.dots
        .filter((_, i) => i % 2 === 0)
        .map((d, i, arr) => {
          if (i === arr.length - 1) return null;
          const next = arr[i + 1];
          const dx = next.x - d.x;
          const dy = next.y - d.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          return (
            <div
              key={`s1-${i}`}
              style={{
                position: 'absolute',
                left: Math.min(d.x, next.x),
                top: d.y,
                width: Math.abs(dx) || 1,
                height: Math.round(dy),
                borderLeft: `1px solid ${CYAN}33`,
                display: 'flex',
              }}
            />
          );
        })}

      {/* Faint glow spots behind helix */}
      <div
        style={{
          position: 'absolute',
          left: 100,
          top: 150,
          width: 120,
          height: 120,
          borderRadius: 60,
          backgroundColor: `${CYAN}08`,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 120,
          top: 380,
          width: 100,
          height: 100,
          borderRadius: 50,
          backgroundColor: `${MAGENTA}08`,
          display: 'flex',
        }}
      />

      {/* Content side */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'absolute',
          left: 320,
          top: 0,
          right: 0,
          bottom: 0,
          padding: 60,
          zIndex: 1,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} height={32} />
        </div>

        {/* Title + excerpt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.2 }}>{meta.title}</div>
          <div
            style={{
              fontSize: 26,
              color: '#8090b0',
              lineHeight: 1.4,
              maxHeight: 80,
              overflow: 'hidden',
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 24, fontSize: 22, color: '#607090' }}>
          <span style={{ fontWeight: 600, color: CYAN }}>{meta.author}</span>
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
                  backgroundColor: '#1a1e2e',
                  padding: '4px 12px',
                  borderRadius: 9999,
                  fontSize: 18,
                  color: CYAN,
                }}
              >
                {tag}
              </span>
            ))}
        </div>
      </div>
    </div>,
    size,
  );
}
