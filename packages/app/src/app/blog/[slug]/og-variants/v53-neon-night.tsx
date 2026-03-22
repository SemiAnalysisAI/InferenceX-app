/**
 * V53: Neon Night — black bg with hot pink and electric blue accent lines
 * and borders. High contrast cyberpunk/nightclub aesthetic. Glowing line effects.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#050505';
const PINK = '#ff1493';
const BLUE = '#00e5ff';

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
      {/* Top neon line — pink */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: 1200,
          height: 2,
          backgroundColor: PINK,
          opacity: 0.9,
        }}
      />
      {/* Top glow — pink (wider, dimmer) */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: 1200,
          height: 6,
          backgroundColor: PINK,
          opacity: 0.2,
        }}
      />

      {/* Bottom neon line — blue */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: 1200,
          height: 2,
          backgroundColor: BLUE,
          opacity: 0.9,
        }}
      />
      {/* Bottom glow — blue */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: 1200,
          height: 6,
          backgroundColor: BLUE,
          opacity: 0.2,
        }}
      />

      {/* Left vertical neon — pink */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: 2,
          height: 630,
          backgroundColor: PINK,
          opacity: 0.7,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: 6,
          height: 630,
          backgroundColor: PINK,
          opacity: 0.15,
        }}
      />

      {/* Right vertical neon — blue */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          right: 0,
          width: 2,
          height: 630,
          backgroundColor: BLUE,
          opacity: 0.7,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          right: 0,
          width: 6,
          height: 630,
          backgroundColor: BLUE,
          opacity: 0.15,
        }}
      />

      {/* Diagonal accent lines — pink */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 80,
          left: 30,
          width: 120,
          height: 1,
          backgroundColor: PINK,
          opacity: 0.5,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 200,
          left: 20,
          width: 80,
          height: 1,
          backgroundColor: PINK,
          opacity: 0.3,
        }}
      />

      {/* Diagonal accent lines — blue */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 80,
          right: 30,
          width: 120,
          height: 1,
          backgroundColor: BLUE,
          opacity: 0.5,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 200,
          right: 20,
          width: 80,
          height: 1,
          backgroundColor: BLUE,
          opacity: 0.3,
        }}
      />

      {/* Neon bordered box — top right corner accent */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 30,
          right: 30,
          width: 50,
          height: 50,
          border: `1px solid ${BLUE}`,
          opacity: 0.25,
        }}
      />

      {/* Neon bordered box — bottom left corner accent */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 30,
          left: 30,
          width: 50,
          height: 50,
          border: `1px solid ${PINK}`,
          opacity: 0.25,
        }}
      />

      {/* Scattered neon dots */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 1100,
          top: 300,
          width: 4,
          height: 4,
          borderRadius: 9999,
          backgroundColor: PINK,
          opacity: 0.5,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 80,
          top: 350,
          width: 4,
          height: 4,
          borderRadius: 9999,
          backgroundColor: BLUE,
          opacity: 0.5,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 1050,
          top: 150,
          width: 3,
          height: 3,
          borderRadius: 9999,
          backgroundColor: BLUE,
          opacity: 0.35,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 150,
          top: 480,
          width: 3,
          height: 3,
          borderRadius: 9999,
          backgroundColor: PINK,
          opacity: 0.35,
        }}
      />

      {/* Horizontal mid accent lines */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 400,
          left: 20,
          width: 60,
          height: 1,
          backgroundColor: PINK,
          opacity: 0.2,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 400,
          right: 20,
          width: 60,
          height: 1,
          backgroundColor: BLUE,
          opacity: 0.2,
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
          <span style={{ color: PINK, fontSize: 22, marginLeft: 14, fontWeight: 600 }}>
            InferenceX
          </span>
        </div>

        {/* Title & excerpt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#8888aa',
              lineHeight: 1.5,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{ color: BLUE, fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#333', fontSize: 18 }}>/</span>
          <span style={{ color: '#777', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#333', fontSize: 18 }}>/</span>
          <span style={{ color: '#777', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
