/**
 * V154: Crystal Formation — Very dark bg with geometric crystal shard shapes
 * (long thin rectangles at various angles suggesting crystal clusters) in
 * amethyst purple and ice blue. Mineral specimen aesthetic.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#0a0a14';
const AMETHYST = '#9966cc';
const ICE_BLUE = '#b8d4e3';
const CRYSTAL_WHITE = '#ffffff';

// Crystal shards — each is a positioned rectangle suggesting a crystal face
// Clustered from the bottom-left corner
const crystals: {
  left: number;
  top: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
  borderOnly: boolean;
}[] = [
  // Main large shards
  { left: 30, top: 180, width: 14, height: 260, color: AMETHYST, opacity: 0.25, borderOnly: false },
  { left: 55, top: 140, width: 10, height: 320, color: ICE_BLUE, opacity: 0.15, borderOnly: true },
  { left: 80, top: 220, width: 18, height: 240, color: AMETHYST, opacity: 0.3, borderOnly: false },
  {
    left: 110,
    top: 160,
    width: 8,
    height: 300,
    color: CRYSTAL_WHITE,
    opacity: 0.08,
    borderOnly: true,
  },
  { left: 130, top: 250, width: 16, height: 210, color: AMETHYST, opacity: 0.2, borderOnly: false },
  {
    left: 160,
    top: 200,
    width: 12,
    height: 280,
    color: ICE_BLUE,
    opacity: 0.18,
    borderOnly: false,
  },
  // Angled shards (horizontal-ish, suggesting cross-growth)
  { left: 20, top: 380, width: 140, height: 6, color: AMETHYST, opacity: 0.15, borderOnly: false },
  { left: 40, top: 340, width: 100, height: 4, color: ICE_BLUE, opacity: 0.1, borderOnly: true },
  {
    left: 60,
    top: 420,
    width: 120,
    height: 8,
    color: CRYSTAL_WHITE,
    opacity: 0.06,
    borderOnly: true,
  },
  // Secondary cluster
  {
    left: 190,
    top: 300,
    width: 10,
    height: 180,
    color: AMETHYST,
    opacity: 0.18,
    borderOnly: false,
  },
  { left: 210, top: 280, width: 6, height: 200, color: ICE_BLUE, opacity: 0.12, borderOnly: true },
  {
    left: 230,
    top: 340,
    width: 14,
    height: 150,
    color: AMETHYST,
    opacity: 0.22,
    borderOnly: false,
  },
  // Small accent crystals
  { left: 250, top: 380, width: 8, height: 120, color: ICE_BLUE, opacity: 0.1, borderOnly: false },
  { left: 270, top: 400, width: 6, height: 100, color: AMETHYST, opacity: 0.15, borderOnly: false },
  // Top-left smaller crystals (scattered)
  {
    left: 50,
    top: 100,
    width: 4,
    height: 60,
    color: CRYSTAL_WHITE,
    opacity: 0.05,
    borderOnly: true,
  },
  { left: 100, top: 80, width: 6, height: 70, color: AMETHYST, opacity: 0.08, borderOnly: false },
  // A few crystals on the right edge for balance
  { left: 1120, top: 500, width: 8, height: 80, color: AMETHYST, opacity: 0.08, borderOnly: false },
  { left: 1140, top: 520, width: 6, height: 70, color: ICE_BLUE, opacity: 0.06, borderOnly: true },
  {
    left: 1160,
    top: 480,
    width: 4,
    height: 100,
    color: CRYSTAL_WHITE,
    opacity: 0.04,
    borderOnly: true,
  },
];

// Crystal "facet" highlights — small diamond-shaped dots at tips
const facets: { x: number; y: number; size: number; color: string }[] = [
  { x: 37, y: 180, size: 6, color: `${AMETHYST}40` },
  { x: 60, y: 140, size: 4, color: `${ICE_BLUE}30` },
  { x: 89, y: 220, size: 7, color: `${AMETHYST}50` },
  { x: 138, y: 250, size: 5, color: `${AMETHYST}35` },
  { x: 166, y: 200, size: 6, color: `${ICE_BLUE}40` },
  { x: 195, y: 300, size: 4, color: `${AMETHYST}30` },
  { x: 237, y: 340, size: 5, color: `${AMETHYST}45` },
];

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
        color: '#e0e0f0',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Crystal shards */}
      {crystals.map((c, i) => (
        <div
          key={`cr${i}`}
          style={{
            position: 'absolute',
            left: c.left,
            top: c.top,
            width: c.width,
            height: c.height,
            ...(c.borderOnly
              ? { border: `1px solid ${c.color}`, opacity: c.opacity }
              : { backgroundColor: c.color, opacity: c.opacity }),
            display: 'flex',
          }}
        />
      ))}

      {/* Crystal facet highlights */}
      {facets.map((f, i) => (
        <div
          key={`f${i}`}
          style={{
            position: 'absolute',
            left: f.x - f.size / 2,
            top: f.y - f.size / 2,
            width: f.size,
            height: f.size,
            backgroundColor: f.color,
            borderRadius: 1,
            display: 'flex',
          }}
        />
      ))}

      {/* Glow behind crystal cluster */}
      <div
        style={{
          position: 'absolute',
          left: 20,
          top: 200,
          width: 280,
          height: 300,
          borderRadius: 150,
          backgroundColor: `${AMETHYST}06`,
          display: 'flex',
        }}
      />

      {/* Content — right side */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'absolute',
          left: 360,
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

        {/* Specimen label */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              fontSize: 13,
              color: AMETHYST,
              letterSpacing: 3,
            }}
          >
            MINERAL SPECIMEN
          </div>
          <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.2, color: '#ffffff' }}>
            {meta.title}
          </div>
          <div
            style={{
              fontSize: 26,
              color: '#707898',
              lineHeight: 1.4,
              maxHeight: 80,
              overflow: 'hidden',
            }}
          >
            {meta.excerpt.length > 130 ? meta.excerpt.slice(0, 130) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 24, fontSize: 22, color: '#586080' }}>
          <span style={{ fontWeight: 600, color: AMETHYST }}>{meta.author}</span>
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
                  backgroundColor: '#12121e',
                  padding: '4px 12px',
                  borderRadius: 9999,
                  fontSize: 18,
                  color: AMETHYST,
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
