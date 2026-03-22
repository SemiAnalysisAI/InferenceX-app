/**
 * V151: Seismograph — Dark bg with horizontal graph-paper lines, a jagged
 * seismograph waveform across the middle, date/time stamps, and red alert
 * sections at peak amplitudes.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#0a0a0e';
const GRAPH_LINE = '#ffffff08';
const WAVE_COLOR = '#40ff80';
const RED_ALERT = '#ff3030';
const MUTED = '#506060';

// Seismograph waveform — a series of (x, y) positions relative to center line
// Center Y of the waveform is at y=315 (middle of canvas)
const CENTER_Y = 290;
const WAVE_POINTS: { x: number; y: number }[] = [];
const ALERT_ZONES: { x: number; width: number }[] = [];

// Generate waveform data
(() => {
  const segments = 80;
  for (let i = 0; i <= segments; i++) {
    const x = (i / segments) * 1200;
    const t = i / segments;
    // Create varying amplitude — calm, then burst, calm, burst pattern
    let amplitude = 8;
    if (t > 0.2 && t < 0.35) amplitude = 60 + Math.sin(t * 40) * 30;
    if (t > 0.55 && t < 0.75) amplitude = 80 + Math.sin(t * 50) * 40;
    if (t > 0.85 && t < 0.92) amplitude = 45 + Math.sin(t * 35) * 20;

    const noise = Math.sin(i * 2.7) * amplitude * 0.8 + Math.sin(i * 5.3) * amplitude * 0.3;
    WAVE_POINTS.push({ x, y: CENTER_Y + noise });
  }

  // Alert zones where amplitude is high
  ALERT_ZONES.push({ x: 240, width: 180 });
  ALERT_ZONES.push({ x: 660, width: 240 });
  ALERT_ZONES.push({ x: 1020, width: 84 });
})();

// Horizontal graph paper lines
const hLines: number[] = [];
for (let y = 0; y <= 630; y += 30) hLines.push(y);

// Vertical graph paper lines
const vLines: number[] = [];
for (let x = 0; x <= 1200; x += 60) vLines.push(x);

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 44 : meta.title.length > 40 ? 52 : 58;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        backgroundColor: BG,
        color: '#d0e8d8',
        padding: 60,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Graph paper — horizontal lines */}
      {hLines.map((y, i) => (
        <div
          key={`h${i}`}
          style={{
            position: 'absolute',
            left: 0,
            top: y,
            width: 1200,
            height: 1,
            backgroundColor: y % 90 === 0 ? '#ffffff10' : GRAPH_LINE,
            display: 'flex',
          }}
        />
      ))}

      {/* Graph paper — vertical lines */}
      {vLines.map((x, i) => (
        <div
          key={`v${i}`}
          style={{
            position: 'absolute',
            left: x,
            top: 0,
            width: 1,
            height: 630,
            backgroundColor: x % 180 === 0 ? '#ffffff10' : GRAPH_LINE,
            display: 'flex',
          }}
        />
      ))}

      {/* Alert zone backgrounds */}
      {ALERT_ZONES.map((zone, i) => (
        <div
          key={`az${i}`}
          style={{
            position: 'absolute',
            left: zone.x,
            top: CENTER_Y - 100,
            width: zone.width,
            height: 200,
            backgroundColor: '#ff000006',
            borderLeft: `1px solid ${RED_ALERT}15`,
            borderRight: `1px solid ${RED_ALERT}15`,
            display: 'flex',
          }}
        />
      ))}

      {/* Center baseline */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: CENTER_Y,
          width: 1200,
          height: 1,
          backgroundColor: '#ffffff18',
          display: 'flex',
        }}
      />

      {/* Waveform segments — rendered as small positioned divs */}
      {WAVE_POINTS.slice(0, -1).map((pt, i) => {
        const next = WAVE_POINTS[i + 1];
        const minY = Math.min(pt.y, next.y);
        const h = Math.abs(next.y - pt.y) || 1;
        const isAlert = ALERT_ZONES.some((z) => pt.x >= z.x && pt.x <= z.x + z.width) && h > 15;
        return (
          <div
            key={`w${i}`}
            style={{
              position: 'absolute',
              left: pt.x,
              top: minY,
              width: Math.abs(next.x - pt.x) || 1,
              height: h,
              backgroundColor: isAlert ? RED_ALERT : WAVE_COLOR,
              opacity: isAlert ? 0.9 : 0.7,
              display: 'flex',
            }}
          />
        );
      })}

      {/* Time stamps */}
      <div
        style={{
          position: 'absolute',
          top: 14,
          left: 20,
          fontSize: 12,
          color: '#ffffff20',
          display: 'flex',
        }}
      >
        {meta.date} 00:00:00 UTC
      </div>
      <div
        style={{
          position: 'absolute',
          top: 14,
          right: 20,
          fontSize: 12,
          color: '#ffffff20',
          display: 'flex',
        }}
      >
        CHANNEL: A1 | GAIN: AUTO | RATE: 100 sps
      </div>

      {/* Magnitude labels */}
      <div
        style={{
          position: 'absolute',
          left: 8,
          top: CENTER_Y - 60,
          fontSize: 10,
          color: '#ffffff15',
          display: 'flex',
        }}
      >
        +2.0
      </div>
      <div
        style={{
          position: 'absolute',
          left: 8,
          top: CENTER_Y + 50,
          fontSize: 10,
          color: '#ffffff15',
          display: 'flex',
        }}
      >
        -2.0
      </div>

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', zIndex: 1 }}>
        <img src={logoSrc} height={32} />
      </div>

      {/* Title + excerpt */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          zIndex: 1,
          marginTop: 80,
        }}
      >
        <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.2, color: '#ffffff' }}>
          {meta.title}
        </div>
        <div
          style={{
            fontSize: 24,
            color: MUTED,
            lineHeight: 1.4,
            maxHeight: 70,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 130 ? meta.excerpt.slice(0, 130) + '\u2026' : meta.excerpt}
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', gap: 24, fontSize: 22, color: MUTED, zIndex: 1 }}>
        <span style={{ fontWeight: 600, color: WAVE_COLOR }}>{meta.author}</span>
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
    </div>,
    size,
  );
}
