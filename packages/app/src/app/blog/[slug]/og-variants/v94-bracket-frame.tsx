/**
 * V94: Bracket Frame — large typographic brackets [ ] framing the title on left and right. Tall thin elements with horizontal caps creating a code/syntax feel. Teal brackets.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const BRACKET_COLOR = '#14b8a6';
const BRACKET_THICKNESS = 4;
const CAP_LENGTH = 28;
const BRACKET_HEIGHT = 320;
const BRACKET_OPACITY = 0.5;

export async function renderOgImage(meta: BlogPostMeta) {
  const logoSrc = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/logo.png'))).toString('base64')}`;
  const titleSize = meta.title.length > 60 ? 48 : meta.title.length > 40 ? 56 : 64;

  const bracketTopY = 155;

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: '#0c1222',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* ===== LEFT BRACKET [ ===== */}
      {/* Vertical bar */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 36,
          top: bracketTopY,
          width: BRACKET_THICKNESS,
          height: BRACKET_HEIGHT,
          backgroundColor: BRACKET_COLOR,
          opacity: BRACKET_OPACITY,
        }}
      />
      {/* Top cap */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 36,
          top: bracketTopY,
          width: CAP_LENGTH,
          height: BRACKET_THICKNESS,
          backgroundColor: BRACKET_COLOR,
          opacity: BRACKET_OPACITY,
        }}
      />
      {/* Bottom cap */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 36,
          top: bracketTopY + BRACKET_HEIGHT - BRACKET_THICKNESS,
          width: CAP_LENGTH,
          height: BRACKET_THICKNESS,
          backgroundColor: BRACKET_COLOR,
          opacity: BRACKET_OPACITY,
        }}
      />

      {/* Inner left bracket — thinner, slightly offset */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 28,
          top: bracketTopY - 8,
          width: 2,
          height: BRACKET_HEIGHT + 16,
          backgroundColor: BRACKET_COLOR,
          opacity: BRACKET_OPACITY * 0.4,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 28,
          top: bracketTopY - 8,
          width: 18,
          height: 2,
          backgroundColor: BRACKET_COLOR,
          opacity: BRACKET_OPACITY * 0.4,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 28,
          top: bracketTopY + BRACKET_HEIGHT + 6,
          width: 18,
          height: 2,
          backgroundColor: BRACKET_COLOR,
          opacity: BRACKET_OPACITY * 0.4,
        }}
      />

      {/* ===== RIGHT BRACKET ] ===== */}
      {/* Vertical bar */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: 36,
          top: bracketTopY,
          width: BRACKET_THICKNESS,
          height: BRACKET_HEIGHT,
          backgroundColor: BRACKET_COLOR,
          opacity: BRACKET_OPACITY,
        }}
      />
      {/* Top cap */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: 36,
          top: bracketTopY,
          width: CAP_LENGTH,
          height: BRACKET_THICKNESS,
          backgroundColor: BRACKET_COLOR,
          opacity: BRACKET_OPACITY,
        }}
      />
      {/* Bottom cap */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: 36,
          top: bracketTopY + BRACKET_HEIGHT - BRACKET_THICKNESS,
          width: CAP_LENGTH,
          height: BRACKET_THICKNESS,
          backgroundColor: BRACKET_COLOR,
          opacity: BRACKET_OPACITY,
        }}
      />

      {/* Inner right bracket */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: 28,
          top: bracketTopY - 8,
          width: 2,
          height: BRACKET_HEIGHT + 16,
          backgroundColor: BRACKET_COLOR,
          opacity: BRACKET_OPACITY * 0.4,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: 28,
          top: bracketTopY - 8,
          width: 18,
          height: 2,
          backgroundColor: BRACKET_COLOR,
          opacity: BRACKET_OPACITY * 0.4,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: 28,
          top: bracketTopY + BRACKET_HEIGHT + 6,
          width: 18,
          height: 2,
          backgroundColor: BRACKET_COLOR,
          opacity: BRACKET_OPACITY * 0.4,
        }}
      />

      {/* Subtle horizontal rule accents */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: 80,
          top: bracketTopY + BRACKET_HEIGHT / 2,
          width: 1040,
          height: 1,
          backgroundColor: BRACKET_COLOR,
          opacity: 0.04,
        }}
      />

      {/* Subtle dot accents at bracket midpoints */}
      {[
        { x: 36 + BRACKET_THICKNESS / 2, y: bracketTopY + BRACKET_HEIGHT / 2 },
        { x: 1200 - 36 - BRACKET_THICKNESS / 2, y: bracketTopY + BRACKET_HEIGHT / 2 },
      ].map((dot, i) => (
        <div
          key={`mid-${i}`}
          style={{
            display: 'flex',
            position: 'absolute',
            left: dot.x - 3,
            top: dot.y - 3,
            width: 6,
            height: 6,
            borderRadius: 9999,
            backgroundColor: BRACKET_COLOR,
            opacity: 0.3,
          }}
        />
      ))}

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '48px 80px',
          width: '100%',
          height: '100%',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} width={44} height={44} />
          <span style={{ color: '#5eead4', fontSize: 22, marginLeft: 12, fontWeight: 600 }}>
            InferenceX
          </span>
        </div>

        {/* Title & excerpt — centered between brackets */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            maxWidth: 920,
            padding: '0 16px',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 800,
              color: '#f0fdfa',
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#2dd4bf',
              lineHeight: 1.5,
              opacity: 0.7,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ color: '#5eead4', fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#134e4a', fontSize: 22 }}>{'\u00b7'}</span>
          <span style={{ color: '#0d9488', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#134e4a', fontSize: 22 }}>{'\u00b7'}</span>
          <span style={{ color: '#0d9488', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
