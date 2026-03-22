/**
 * V95: Arrow Accent — large directional arrow element pointing right, positioned behind the title. Suggests forward momentum. Subtle, low opacity.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const ARROW_COLOR = '#6366f1';

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
        backgroundColor: '#0a0a1a',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* ===== LARGE ARROW — pointing right, behind content ===== */}
      {/* Arrow shaft */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 80,
          top: 280,
          width: 700,
          height: 70,
          backgroundColor: ARROW_COLOR,
          opacity: 0.06,
        }}
      />

      {/* Arrow head — upper diagonal */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 700,
          top: 180,
          width: 250,
          height: 70,
          backgroundColor: ARROW_COLOR,
          opacity: 0.06,
          transform: 'rotate(25deg)',
          transformOrigin: '0 100%',
        }}
      />

      {/* Arrow head — lower diagonal */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 700,
          top: 380,
          width: 250,
          height: 70,
          backgroundColor: ARROW_COLOR,
          opacity: 0.06,
          transform: 'rotate(-25deg)',
          transformOrigin: '0 0',
        }}
      />

      {/* ===== SECONDARY SMALLER ARROW — right side, higher ===== */}
      {/* Shaft */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 750,
          top: 100,
          width: 280,
          height: 24,
          backgroundColor: ARROW_COLOR,
          opacity: 0.04,
        }}
      />

      {/* Head upper */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 980,
          top: 68,
          width: 100,
          height: 24,
          backgroundColor: ARROW_COLOR,
          opacity: 0.04,
          transform: 'rotate(25deg)',
          transformOrigin: '0 100%',
        }}
      />

      {/* Head lower */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 980,
          top: 132,
          width: 100,
          height: 24,
          backgroundColor: ARROW_COLOR,
          opacity: 0.04,
          transform: 'rotate(-25deg)',
          transformOrigin: '0 0',
        }}
      />

      {/* ===== TERTIARY ARROW — bottom right ===== */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 800,
          top: 520,
          width: 220,
          height: 16,
          backgroundColor: ARROW_COLOR,
          opacity: 0.035,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 980,
          top: 500,
          width: 80,
          height: 16,
          backgroundColor: ARROW_COLOR,
          opacity: 0.035,
          transform: 'rotate(25deg)',
          transformOrigin: '0 100%',
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 980,
          top: 544,
          width: 80,
          height: 16,
          backgroundColor: ARROW_COLOR,
          opacity: 0.035,
          transform: 'rotate(-25deg)',
          transformOrigin: '0 0',
        }}
      />

      {/* Accent line — thin horizontal stripe */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 56,
          top: 315,
          width: 60,
          height: 2,
          backgroundColor: ARROW_COLOR,
          opacity: 0.2,
        }}
      />

      {/* Accent dots — trajectory path */}
      {[
        { x: 140, y: 316 },
        { x: 200, y: 316 },
        { x: 260, y: 316 },
        { x: 320, y: 316 },
        { x: 380, y: 316 },
      ].map((dot, i) => (
        <div
          key={`traj-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: dot.x - 2,
            top: dot.y - 2,
            width: 4,
            height: 4,
            borderRadius: 9999,
            backgroundColor: ARROW_COLOR,
            opacity: 0.12 + i * 0.02,
          }}
        />
      ))}

      {/* Subtle glow */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 500,
          top: 180,
          width: 400,
          height: 300,
          borderRadius: 9999,
          backgroundColor: '#4338ca',
          opacity: 0.03,
        }}
      />

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
          <span style={{ color: '#a5b4fc', fontSize: 22, marginLeft: 12, fontWeight: 600 }}>
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
              color: '#eef2ff',
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#818cf8',
              lineHeight: 1.5,
              opacity: 0.75,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ color: '#a5b4fc', fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#1e1b4b', fontSize: 22 }}>{'\u00b7'}</span>
          <span style={{ color: '#6366f1', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#1e1b4b', fontSize: 22 }}>{'\u00b7'}</span>
          <span style={{ color: '#6366f1', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
