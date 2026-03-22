/**
 * V52: Copper Patina — dark teal-grey bg with copper and verdigris accents.
 * Aged/oxidized metal feel. Mix of border elements and solid accent bars.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#0f1a1a';
const COPPER = '#b87333';
const VERDIGRIS = '#4a8c7f';
const COPPER_DARK = '#8a5522';
const VERDIGRIS_LIGHT = '#6aac9f';

// Solid accent bars — representing metal plate edges
const bars = [
  // Left edge copper plates
  { left: 0, top: 0, width: 5, height: 180, color: COPPER, opacity: 0.6 },
  { left: 0, top: 200, width: 5, height: 140, color: VERDIGRIS, opacity: 0.4 },
  { left: 0, top: 360, width: 5, height: 270, color: COPPER, opacity: 0.5 },
  // Right edge patina
  { left: 1195, top: 0, width: 5, height: 250, color: VERDIGRIS, opacity: 0.4 },
  { left: 1195, top: 270, width: 5, height: 160, color: COPPER, opacity: 0.5 },
  { left: 1195, top: 450, width: 5, height: 180, color: VERDIGRIS, opacity: 0.35 },
  // Top copper bar
  { left: 0, top: 0, width: 1200, height: 3, color: COPPER, opacity: 0.5 },
  // Bottom verdigris bar
  { left: 0, top: 627, width: 1200, height: 3, color: VERDIGRIS, opacity: 0.5 },
];

// Bordered panel elements — oxidized metal plate outlines
const panels = [
  { left: 30, top: 30, width: 120, height: 80, borderColor: COPPER, opacity: 0.15 },
  { left: 1050, top: 30, width: 120, height: 80, borderColor: VERDIGRIS, opacity: 0.12 },
  { left: 30, top: 520, width: 100, height: 70, borderColor: VERDIGRIS, opacity: 0.1 },
  { left: 1070, top: 530, width: 100, height: 60, borderColor: COPPER, opacity: 0.12 },
];

// Patina texture — scattered small horizontal marks
const marks = [
  { left: 40, top: 150, width: 30, height: 2, color: VERDIGRIS, opacity: 0.2 },
  { left: 100, top: 180, width: 20, height: 1, color: COPPER_DARK, opacity: 0.15 },
  { left: 60, top: 420, width: 25, height: 2, color: VERDIGRIS, opacity: 0.12 },
  { left: 1100, top: 180, width: 35, height: 2, color: COPPER, opacity: 0.18 },
  { left: 1050, top: 400, width: 28, height: 1, color: VERDIGRIS, opacity: 0.15 },
  { left: 1120, top: 350, width: 20, height: 2, color: COPPER_DARK, opacity: 0.1 },
];

// Rivets — small dots like metal fasteners
const rivets = [
  { x: 35, y: 35, size: 5, color: COPPER },
  { x: 145, y: 35, size: 5, color: COPPER },
  { x: 35, y: 105, size: 5, color: COPPER },
  { x: 145, y: 105, size: 5, color: COPPER },
  { x: 1055, y: 35, size: 5, color: VERDIGRIS },
  { x: 1165, y: 35, size: 5, color: VERDIGRIS },
  { x: 1055, y: 105, size: 5, color: VERDIGRIS },
  { x: 1165, y: 105, size: 5, color: VERDIGRIS },
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
      {/* Accent bars */}
      {bars.map((bar, i) => (
        <div
          key={`b${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: bar.left,
            top: bar.top,
            width: bar.width,
            height: bar.height,
            backgroundColor: bar.color,
            opacity: bar.opacity,
          }}
        />
      ))}

      {/* Bordered panel outlines */}
      {panels.map((p, i) => (
        <div
          key={`p${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: p.left,
            top: p.top,
            width: p.width,
            height: p.height,
            border: `1px solid ${p.borderColor}`,
            opacity: p.opacity,
          }}
        />
      ))}

      {/* Patina marks */}
      {marks.map((m, i) => (
        <div
          key={`m${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: m.left,
            top: m.top,
            width: m.width,
            height: m.height,
            backgroundColor: m.color,
            opacity: m.opacity,
          }}
        />
      ))}

      {/* Rivets */}
      {rivets.map((r, i) => (
        <div
          key={`r${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: r.x,
            top: r.y,
            width: r.size,
            height: r.size,
            borderRadius: 9999,
            backgroundColor: r.color,
            opacity: 0.2,
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
          <span style={{ color: COPPER, fontSize: 22, marginLeft: 14, fontWeight: 600 }}>
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
              color: '#f0e6d6',
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: VERDIGRIS_LIGHT,
              lineHeight: 1.5,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{ color: COPPER, fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#2a4040', fontSize: 18 }}>/</span>
          <span style={{ color: VERDIGRIS, fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#2a4040', fontSize: 18 }}>/</span>
          <span style={{ color: VERDIGRIS, fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
