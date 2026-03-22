/**
 * V148: Weather Map — Dark bg with concentric radar sweep circles in green,
 * scattered blips, military/meteorological data readout aesthetic.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#0a100a';
const GREEN = '#00ff00';
const GREEN_DIM = '#00ff0015';
const GREEN_MID = '#00ff0025';
const GREEN_TEXT = '#00cc00';

// Radar center
const CX = 200;
const CY = 315;

// Concentric rings
const rings = [60, 120, 180, 240, 300];

// Blips on the radar
const blips: { angle: number; ring: number; size: number; opacity: number }[] = [
  { angle: 0.4, ring: 80, size: 6, opacity: 0.9 },
  { angle: 1.2, ring: 150, size: 4, opacity: 0.7 },
  { angle: 2.0, ring: 200, size: 5, opacity: 0.8 },
  { angle: 2.8, ring: 110, size: 3, opacity: 0.6 },
  { angle: 3.5, ring: 250, size: 7, opacity: 0.9 },
  { angle: 4.2, ring: 170, size: 4, opacity: 0.5 },
  { angle: 5.0, ring: 90, size: 5, opacity: 0.7 },
  { angle: 5.8, ring: 220, size: 6, opacity: 0.8 },
  { angle: 0.8, ring: 280, size: 4, opacity: 0.6 },
  { angle: 1.8, ring: 60, size: 3, opacity: 0.5 },
];

// Cross-hair lines through center
const crosshairLen = 310;

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
        color: '#e0ffe0',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top status bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 36,
          backgroundColor: '#001a00',
          borderBottom: `1px solid ${GREEN_DIM}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          gap: 40,
          fontSize: 13,
          color: GREEN_TEXT,
        }}
      >
        <span style={{ display: 'flex' }}>STATION: INFERENCEX</span>
        <span style={{ display: 'flex' }}>LAT 37.7749</span>
        <span style={{ display: 'flex' }}>LON -122.4194</span>
        <span style={{ display: 'flex' }}>FREQ 5.625 GHz</span>
        <span style={{ display: 'flex' }}>MODE: ACTIVE SCAN</span>
      </div>

      {/* Radar concentric rings */}
      {rings.map((r, i) => (
        <div
          key={`ring${i}`}
          style={{
            position: 'absolute',
            left: CX - r,
            top: CY - r,
            width: r * 2,
            height: r * 2,
            borderRadius: r,
            border: `1px solid ${i % 2 === 0 ? GREEN_MID : GREEN_DIM}`,
            display: 'flex',
          }}
        />
      ))}

      {/* Crosshair — horizontal */}
      <div
        style={{
          position: 'absolute',
          left: CX - crosshairLen,
          top: CY,
          width: crosshairLen * 2,
          height: 1,
          backgroundColor: GREEN_DIM,
          display: 'flex',
        }}
      />
      {/* Crosshair — vertical */}
      <div
        style={{
          position: 'absolute',
          left: CX,
          top: CY - crosshairLen,
          width: 1,
          height: crosshairLen * 2,
          backgroundColor: GREEN_DIM,
          display: 'flex',
        }}
      />

      {/* Center dot */}
      <div
        style={{
          position: 'absolute',
          left: CX - 3,
          top: CY - 3,
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: GREEN,
          opacity: 0.8,
          display: 'flex',
        }}
      />

      {/* Blips */}
      {blips.map((b, i) => {
        const bx = CX + Math.cos(b.angle) * b.ring;
        const by = CY + Math.sin(b.angle) * b.ring;
        return (
          <div
            key={`blip${i}`}
            style={{
              position: 'absolute',
              left: bx - b.size / 2,
              top: by - b.size / 2,
              width: b.size,
              height: b.size,
              borderRadius: b.size / 2,
              backgroundColor: GREEN,
              opacity: b.opacity,
              display: 'flex',
            }}
          />
        );
      })}

      {/* Range labels */}
      {rings.map((r, i) => (
        <div
          key={`rl${i}`}
          style={{
            position: 'absolute',
            left: CX + r + 4,
            top: CY - 8,
            fontSize: 10,
            color: '#00ff0030',
            display: 'flex',
          }}
        >
          {r}nm
        </div>
      ))}

      {/* Content area — right side */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'absolute',
          left: 520,
          top: 50,
          right: 50,
          bottom: 50,
          zIndex: 1,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} height={32} />
        </div>

        {/* Title + excerpt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              fontSize: 12,
              color: GREEN_TEXT,
              letterSpacing: 3,
            }}
          >
            ADVISORY BULLETIN
          </div>
          <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.2, color: '#ffffff' }}>
            {meta.title}
          </div>
          <div
            style={{
              fontSize: 24,
              color: '#608060',
              lineHeight: 1.4,
              maxHeight: 75,
              overflow: 'hidden',
            }}
          >
            {meta.excerpt.length > 120 ? meta.excerpt.slice(0, 120) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 20, fontSize: 20, color: '#407040' }}>
          <span style={{ fontWeight: 600, color: GREEN_TEXT }}>{meta.author}</span>
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
        </div>
      </div>

      {/* Bottom status */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: 520,
          height: 28,
          backgroundColor: '#001a00',
          borderTop: `1px solid ${GREEN_DIM}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          fontSize: 11,
          color: '#00ff0030',
        }}
      >
        TARGETS: {blips.length} DETECTED | SWEEP: 360° | SIGNAL: NOMINAL
      </div>
    </div>,
    size,
  );
}
