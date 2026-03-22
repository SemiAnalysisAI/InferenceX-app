/**
 * V51: Royal Purple — deep purple bg with gold ornamental accents.
 * Thin horizontal rules, corner elements. Rich, luxurious feel. Cream text.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BG = '#1a0a2e';
const GOLD = '#F7B041';
const CREAM = '#faf5e4';
const GOLD_DIM = '#b8862d';

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
      {/* Top gold border */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: 1200,
          height: 3,
          backgroundColor: GOLD,
          opacity: 0.8,
        }}
      />

      {/* Bottom gold border */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: 1200,
          height: 3,
          backgroundColor: GOLD,
          opacity: 0.8,
        }}
      />

      {/* Top-left corner ornament — horizontal */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 20,
          left: 20,
          width: 60,
          height: 2,
          backgroundColor: GOLD,
          opacity: 0.6,
        }}
      />
      {/* Top-left corner ornament — vertical */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 20,
          left: 20,
          width: 2,
          height: 60,
          backgroundColor: GOLD,
          opacity: 0.6,
        }}
      />

      {/* Top-right corner ornament — horizontal */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 20,
          right: 20,
          width: 60,
          height: 2,
          backgroundColor: GOLD,
          opacity: 0.6,
        }}
      />
      {/* Top-right corner ornament — vertical */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 20,
          right: 20,
          width: 2,
          height: 60,
          backgroundColor: GOLD,
          opacity: 0.6,
        }}
      />

      {/* Bottom-left corner ornament — horizontal */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 20,
          left: 20,
          width: 60,
          height: 2,
          backgroundColor: GOLD,
          opacity: 0.6,
        }}
      />
      {/* Bottom-left corner ornament — vertical */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 20,
          left: 20,
          width: 2,
          height: 60,
          backgroundColor: GOLD,
          opacity: 0.6,
        }}
      />

      {/* Bottom-right corner ornament — horizontal */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 20,
          right: 20,
          width: 60,
          height: 2,
          backgroundColor: GOLD,
          opacity: 0.6,
        }}
      />
      {/* Bottom-right corner ornament — vertical */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 20,
          right: 20,
          width: 2,
          height: 60,
          backgroundColor: GOLD,
          opacity: 0.6,
        }}
      />

      {/* Thin horizontal gold rule — upper */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 115,
          left: 56,
          width: 1088,
          height: 1,
          backgroundColor: GOLD,
          opacity: 0.25,
        }}
      />

      {/* Thin horizontal gold rule — lower */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 100,
          left: 56,
          width: 1088,
          height: 1,
          backgroundColor: GOLD,
          opacity: 0.25,
        }}
      />

      {/* Small gold diamond accents along the rules */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 112,
          left: 580,
          width: 8,
          height: 8,
          backgroundColor: GOLD,
          opacity: 0.3,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          bottom: 97,
          left: 580,
          width: 8,
          height: 8,
          backgroundColor: GOLD,
          opacity: 0.3,
        }}
      />

      {/* Subtle purple depth panels on sides */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: 8,
          height: 630,
          backgroundColor: '#2d1050',
          opacity: 0.6,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          right: 0,
          width: 8,
          height: 630,
          backgroundColor: '#2d1050',
          opacity: 0.6,
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
          <span style={{ color: GOLD, fontSize: 22, marginLeft: 14, fontWeight: 600 }}>
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
              color: CREAM,
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#c4b896',
              lineHeight: 1.5,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{ color: GOLD, fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#4a2a6a', fontSize: 18 }}>/</span>
          <span style={{ color: GOLD_DIM, fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#4a2a6a', fontSize: 18 }}>/</span>
          <span style={{ color: GOLD_DIM, fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
