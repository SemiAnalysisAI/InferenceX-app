/**
 * V10: Border Frame — Circuit blocks form a border/frame around the entire card.
 * Content centered within. Strong visual identity, most similar to the sitewide OG.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

function FrameBlock({
  x,
  y,
  w,
  h,
  color,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        border: `1.5px solid ${color}`,
        borderRadius: 3,
        display: 'flex',
      }}
    />
  );
}

const TEAL = '#2dd4bf';
const GOLD = '#eab308';

// Top edge blocks
const topBlocks = Array.from({ length: 14 }).map((_, i) => ({
  x: 10 + i * 85,
  y: 8 + (i % 3) * 6,
  w: 72,
  h: 50 - (i % 2) * 10,
  color: i === 4 || i === 10 ? `${GOLD}40` : `${TEAL}${18 + (i % 4) * 5}`,
}));

// Bottom edge blocks
const bottomBlocks = Array.from({ length: 14 }).map((_, i) => ({
  x: 10 + i * 85,
  y: 574 + (i % 3) * 4,
  w: 72,
  h: 48 - (i % 2) * 8,
  color: i === 3 || i === 9 ? `${GOLD}35` : `${TEAL}${16 + (i % 4) * 5}`,
}));

// Left edge blocks
const leftBlocks = Array.from({ length: 6 }).map((_, i) => ({
  x: 8 + (i % 2) * 5,
  y: 70 + i * 90,
  w: 55 - (i % 2) * 10,
  h: 75,
  color: i === 2 ? `${GOLD}40` : `${TEAL}${18 + (i % 3) * 6}`,
}));

// Right edge blocks
const rightBlocks = Array.from({ length: 6 }).map((_, i) => ({
  x: 1132 + (i % 2) * 5,
  y: 70 + i * 90,
  w: 55 - (i % 2) * 10,
  h: 75,
  color: i === 4 ? `${GOLD}35` : `${TEAL}${16 + (i % 3) * 6}`,
}));

const allBlocks = [...topBlocks, ...bottomBlocks, ...leftBlocks, ...rightBlocks];

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
        backgroundColor: '#0c0c0e',
        color: '#fafafa',
        padding: '80px 90px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Frame blocks */}
      {allBlocks.map((b, i) => (
        <FrameBlock key={i} x={b.x} y={b.y} w={b.w} h={b.h} color={b.color} />
      ))}

      {/* Gold corner accents */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 60,
          height: 3,
          backgroundColor: `${GOLD}80`,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 3,
          height: 60,
          backgroundColor: `${GOLD}80`,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: 60,
          height: 3,
          backgroundColor: `${GOLD}80`,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: 3,
          height: 60,
          backgroundColor: `${GOLD}80`,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: 60,
          height: 3,
          backgroundColor: `${GOLD}80`,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: 3,
          height: 60,
          backgroundColor: `${GOLD}80`,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 60,
          height: 3,
          backgroundColor: `${GOLD}80`,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 3,
          height: 60,
          backgroundColor: `${GOLD}80`,
          display: 'flex',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', zIndex: 1 }}>
        <img src={logoSrc} height={96} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, zIndex: 1 }}>
        <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.2 }}>{meta.title}</div>
        <div
          style={{
            fontSize: 28,
            color: '#a1a1aa',
            lineHeight: 1.4,
            maxHeight: 80,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '...' : meta.excerpt}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, fontSize: 24, color: '#a1a1aa', zIndex: 1 }}>
        <span>{meta.author}</span>
        <span>·</span>
        <span>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
        <span>·</span>
        <span>{meta.readingTime} min read</span>
        {meta.tags &&
          meta.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              style={{
                backgroundColor: '#27272a',
                padding: '4px 12px',
                borderRadius: 9999,
                fontSize: 20,
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
