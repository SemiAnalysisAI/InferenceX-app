/**
 * V3: Grid Overlay — Full-width circuit grid pattern behind content.
 * Dense block grid reminiscent of the sitewide OG's tiled circuit pattern.
 * Content reads over a semi-transparent gradient overlay.
 */
import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

function GridCell({
  x,
  y,
  w,
  h,
  variant,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  variant: number;
}) {
  const patterns: Record<number, React.ReactNode> = {
    // Empty cell — subtle border
    0: (
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: w,
          height: h,
          border: '1px solid #2dd4bf12',
          display: 'flex',
        }}
      />
    ),
    // Teal traced cell
    1: (
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: w,
          height: h,
          border: '1px solid #2dd4bf25',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: w * 0.6,
            height: h * 0.6,
            border: '2px solid #2dd4bf20',
            borderRadius: 3,
            display: 'flex',
          }}
        />
      </div>
    ),
    // Gold accent cell
    2: (
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: w,
          height: h,
          border: '1px solid #eab30825',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: w * 0.5,
            height: h * 0.5,
            border: '2px solid #eab30835',
            borderRadius: 2,
            display: 'flex',
          }}
        />
      </div>
    ),
    // Trace lines
    3: (
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: w,
          height: h,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div style={{ width: '100%', height: 1, backgroundColor: '#2dd4bf18', display: 'flex' }} />
      </div>
    ),
  };

  return patterns[variant] ?? patterns[0];
}

// Seeded pattern — deterministic grid layout
const GRID: number[][] = [
  [0, 1, 0, 3, 0, 1, 2, 0, 1, 0],
  [3, 0, 0, 1, 0, 0, 0, 1, 0, 3],
  [0, 0, 2, 0, 0, 0, 0, 0, 0, 0],
  [1, 0, 0, 0, 0, 0, 0, 0, 2, 1],
  [0, 3, 0, 0, 0, 0, 1, 0, 0, 0],
  [0, 0, 1, 0, 2, 0, 0, 3, 0, 1],
];

const CELL_W = 120;
const CELL_H = 105;

export function renderOgImage(meta: BlogPostMeta) {
  const titleSize = meta.title.length > 60 ? 40 : meta.title.length > 40 ? 48 : 56;

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
      {/* Grid cells */}
      {GRID.flatMap((row, ry) =>
        row.map((variant, cx) => (
          <GridCell
            key={`${ry}-${cx}`}
            x={cx * CELL_W}
            y={ry * CELL_H}
            w={CELL_W}
            h={CELL_H}
            variant={variant}
          />
        )),
      )}

      {/* Gradient overlay to ensure text readability */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #0c0c0eee 0%, #0c0c0ecc 50%, #0c0c0eee 100%)',
          display: 'flex',
        }}
      />

      <div style={{ display: 'flex', fontSize: 20, color: '#a1a1aa', zIndex: 1 }}>
        InferenceX Blog — SemiAnalysis
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, zIndex: 1 }}>
        <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.2 }}>{meta.title}</div>
        <div
          style={{
            fontSize: 22,
            color: '#a1a1aa',
            lineHeight: 1.4,
            maxHeight: 62,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '…' : meta.excerpt}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, fontSize: 18, color: '#a1a1aa', zIndex: 1 }}>
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
                fontSize: 14,
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
