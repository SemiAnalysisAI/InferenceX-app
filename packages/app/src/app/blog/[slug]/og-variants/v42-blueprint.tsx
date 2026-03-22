/**
 * V42: Blueprint — Blue grid lines on dark navy background. Major grid lines
 * every ~100px, minor every ~25px. White text for content. Engineering feel.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#0a1628';
const MAJOR_LINE = '#1e40af20';
const MINOR_LINE = '#1e40af0c';
const ACCENT = '#3b82f6';

// Major grid lines (every 100px)
const majorHorizontal = Array.from({ length: 7 }, (_, i) => i * 100);
const majorVertical = Array.from({ length: 13 }, (_, i) => i * 100);

// Minor grid lines (every 25px)
const minorHorizontal = Array.from({ length: 26 }, (_, i) => i * 25).filter((v) => v % 100 !== 0);
const minorVertical = Array.from({ length: 49 }, (_, i) => i * 25).filter((v) => v % 100 !== 0);

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
        color: '#e8f0ff',
        padding: 60,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Minor horizontal lines */}
      {minorHorizontal.map((y, i) => (
        <div
          key={`mh${i}`}
          style={{
            position: 'absolute',
            left: 0,
            top: y,
            width: 1200,
            height: 1,
            backgroundColor: MINOR_LINE,
            display: 'flex',
          }}
        />
      ))}

      {/* Minor vertical lines */}
      {minorVertical.map((x, i) => (
        <div
          key={`mv${i}`}
          style={{
            position: 'absolute',
            left: x,
            top: 0,
            width: 1,
            height: 630,
            backgroundColor: MINOR_LINE,
            display: 'flex',
          }}
        />
      ))}

      {/* Major horizontal lines */}
      {majorHorizontal.map((y, i) => (
        <div
          key={`Mh${i}`}
          style={{
            position: 'absolute',
            left: 0,
            top: y,
            width: 1200,
            height: 1,
            backgroundColor: MAJOR_LINE,
            display: 'flex',
          }}
        />
      ))}

      {/* Major vertical lines */}
      {majorVertical.map((x, i) => (
        <div
          key={`Mv${i}`}
          style={{
            position: 'absolute',
            left: x,
            top: 0,
            width: 1,
            height: 630,
            backgroundColor: MAJOR_LINE,
            display: 'flex',
          }}
        />
      ))}

      {/* Blueprint corner marks */}
      {/* Top-left */}
      <div
        style={{
          position: 'absolute',
          left: 30,
          top: 30,
          width: 20,
          height: 1,
          backgroundColor: ACCENT + '40',
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 30,
          top: 30,
          width: 1,
          height: 20,
          backgroundColor: ACCENT + '40',
          display: 'flex',
        }}
      />
      {/* Top-right */}
      <div
        style={{
          position: 'absolute',
          right: 30,
          top: 30,
          width: 20,
          height: 1,
          backgroundColor: ACCENT + '40',
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 30,
          top: 30,
          width: 1,
          height: 20,
          backgroundColor: ACCENT + '40',
          display: 'flex',
        }}
      />
      {/* Bottom-left */}
      <div
        style={{
          position: 'absolute',
          left: 30,
          bottom: 30,
          width: 20,
          height: 1,
          backgroundColor: ACCENT + '40',
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 30,
          bottom: 50,
          width: 1,
          height: 20,
          backgroundColor: ACCENT + '40',
          display: 'flex',
        }}
      />
      {/* Bottom-right */}
      <div
        style={{
          position: 'absolute',
          right: 30,
          bottom: 30,
          width: 20,
          height: 1,
          backgroundColor: ACCENT + '40',
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 30,
          bottom: 50,
          width: 1,
          height: 20,
          backgroundColor: ACCENT + '40',
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
            color: '#7090c0',
            lineHeight: 1.4,
            maxHeight: 80,
            overflow: 'hidden',
          }}
        >
          {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', gap: 24, fontSize: 22, color: '#5878a8', zIndex: 1 }}>
        <span style={{ fontWeight: 600, color: ACCENT }}>{meta.author}</span>
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
