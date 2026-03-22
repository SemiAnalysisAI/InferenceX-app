/**
 * V39: Sound Wave — Audio waveform/equalizer visualization with vertical bars
 * of varying heights arranged at the bottom. Teal/cyan bars on dark bg.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#0a0e14';
const BAR_COLOR = '#06b6d4';

// 48 bars creating a waveform shape — heights follow a bell-curve-ish pattern
const barHeights = [
  20, 35, 25, 50, 40, 65, 30, 80, 55, 95, 45, 110, 70, 130, 85, 150, 100, 170, 120, 185, 140, 200,
  160, 210, 180, 215, 190, 210, 175, 195, 155, 180, 135, 160, 110, 140, 90, 120, 70, 95, 50, 75, 35,
  55, 25, 40, 20, 30,
];

const barWidth = 16;
const barGap = 9;
const totalBarsWidth = barHeights.length * (barWidth + barGap) - barGap;
const startX = Math.floor((1200 - totalBarsWidth) / 2);

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
        backgroundColor: BG,
        color: '#f0f8ff',
        padding: 60,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Waveform bars at the bottom */}
      {barHeights.map((h, i) => (
        <div
          key={`bar${i}`}
          style={{
            position: 'absolute',
            left: startX + i * (barWidth + barGap),
            bottom: 0,
            width: barWidth,
            height: h,
            backgroundColor: `${BAR_COLOR}${i % 3 === 0 ? '35' : '20'}`,
            borderRadius: 2,
            display: 'flex',
          }}
        />
      ))}

      {/* Bar caps — bright tops */}
      {barHeights.map((h, i) => (
        <div
          key={`cap${i}`}
          style={{
            position: 'absolute',
            left: startX + i * (barWidth + barGap),
            bottom: h - 3,
            width: barWidth,
            height: 3,
            backgroundColor: `${BAR_COLOR}60`,
            borderRadius: 1,
            display: 'flex',
          }}
        />
      ))}

      {/* Horizontal baseline */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: 1200,
          height: 1,
          backgroundColor: '#06b6d425',
          display: 'flex',
        }}
      />

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', zIndex: 1 }}>
        <img src={logoSrc} height={32} />
      </div>

      {/* Title + excerpt */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, zIndex: 1 }}>
        <div style={{ fontSize: titleSize, fontWeight: 700, lineHeight: 1.2, color: '#ffffff' }}>
          {meta.title}
        </div>
        <div
          style={{
            fontSize: 26,
            color: '#88b8cc',
            lineHeight: 1.4,
            maxHeight: 80,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', gap: 24, fontSize: 22, color: '#68a8c0', zIndex: 1 }}>
        <span style={{ fontWeight: 600, color: '#90d0e8' }}>{meta.author}</span>
        <span>{'\u00b7'}</span>
        <span>
          {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
      </div>
    </div>,
    size,
  );
}
