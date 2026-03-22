/**
 * V2: Circuit Corners — Block/circuit trace pattern in top-right and bottom-left corners.
 * Inspired by the sitewide OG image. Teal traces on dark background with gold accent blocks.
 * Content stays in the center, patterns frame it.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

function CircuitBlock({
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
        border: `2px solid ${color}`,
        borderRadius: 4,
        display: 'flex',
      }}
    />
  );
}

function TraceLine({
  x1,
  y1,
  length,
  vertical,
  color,
}: {
  x1: number;
  y1: number;
  length: number;
  vertical?: boolean;
  color: string;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x1,
        top: y1,
        width: vertical ? 2 : length,
        height: vertical ? length : 2,
        backgroundColor: color,
        display: 'flex',
      }}
    />
  );
}

const TEAL = '#2dd4bf30';
const TEAL_STRONG = '#2dd4bf60';
const GOLD = '#eab30850';
const GOLD_STRONG = '#eab308';

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 56 : meta.title.length > 40 ? 64 : 72;

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
        padding: 60,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top-right circuit pattern */}
      <CircuitBlock x={900} y={20} w={80} h={80} color={TEAL} />
      <CircuitBlock x={1000} y={30} w={60} h={60} color={TEAL_STRONG} />
      <CircuitBlock x={1080} y={10} w={100} h={100} color={TEAL} />
      <CircuitBlock x={950} y={110} w={50} h={50} color={GOLD} />
      <CircuitBlock x={1020} y={120} w={70} h={40} color={TEAL} />
      <CircuitBlock x={1100} y={130} w={80} h={60} color={TEAL_STRONG} />
      <TraceLine x1={940} y1={60} length={60} color={TEAL} />
      <TraceLine x1={1000} y1={90} length={80} color={TEAL} />
      <TraceLine x1={1060} y1={60} length={70} vertical color={TEAL} />
      <TraceLine x1={980} y1={135} length={40} vertical color={GOLD} />

      {/* Bottom-left circuit pattern */}
      <CircuitBlock x={20} y={480} w={90} h={70} color={TEAL} />
      <CircuitBlock x={130} y={500} w={60} h={60} color={TEAL_STRONG} />
      <CircuitBlock x={50} y={560} w={80} h={50} color={TEAL} />
      <CircuitBlock x={200} y={540} w={50} h={50} color={GOLD} />
      <CircuitBlock x={150} y={570} w={70} h={40} color={TEAL} />
      <TraceLine x1={110} y1={520} length={50} color={TEAL} />
      <TraceLine x1={70} y1={555} length={60} color={TEAL} />
      <TraceLine x1={190} y1={510} length={50} vertical color={TEAL} />
      <TraceLine x1={220} y1={560} length={40} color={GOLD} />

      {/* Gold accent line — left edge */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 180,
          width: 4,
          height: 270,
          backgroundColor: GOLD_STRONG,
          display: 'flex',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', zIndex: 1 }}>
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
