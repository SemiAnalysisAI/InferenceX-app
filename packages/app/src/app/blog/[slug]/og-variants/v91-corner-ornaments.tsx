/**
 * V91: Corner Ornaments — decorative ornamental elements in each corner made of small lines and dots, like certificate/diploma corners. Gold/brass on dark slate.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import type { BlogPostMeta } from '@/lib/blog';

export const size = { width: 1200, height: 630 };

const ORNAMENT_COLOR = '#c9a84c';
const ORNAMENT_OPACITY = 0.45;
const DOT_SIZE = 6;
const LINE_THICKNESS = 2;
const CORNER_INSET = 28;
const ARM_LENGTH = 70;
const INNER_ARM = 50;

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
        backgroundColor: '#1a1d2e',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* ===== TOP-LEFT CORNER ===== */}
      {/* Outer horizontal line */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: CORNER_INSET,
          top: CORNER_INSET,
          width: ARM_LENGTH,
          height: LINE_THICKNESS,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY,
        }}
      />
      {/* Outer vertical line */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: CORNER_INSET,
          top: CORNER_INSET,
          width: LINE_THICKNESS,
          height: ARM_LENGTH,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY,
        }}
      />
      {/* Inner horizontal line */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: CORNER_INSET + 12,
          top: CORNER_INSET + 12,
          width: INNER_ARM,
          height: LINE_THICKNESS,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY * 0.6,
        }}
      />
      {/* Inner vertical line */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: CORNER_INSET + 12,
          top: CORNER_INSET + 12,
          width: LINE_THICKNESS,
          height: INNER_ARM,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY * 0.6,
        }}
      />
      {/* Corner dot */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: CORNER_INSET - DOT_SIZE / 2,
          top: CORNER_INSET - DOT_SIZE / 2,
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: 9999,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY,
        }}
      />
      {/* End dot horizontal */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: CORNER_INSET + ARM_LENGTH - DOT_SIZE / 2,
          top: CORNER_INSET - DOT_SIZE / 2 + 1,
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: 9999,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY * 0.7,
        }}
      />
      {/* End dot vertical */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: CORNER_INSET - DOT_SIZE / 2 + 1,
          top: CORNER_INSET + ARM_LENGTH - DOT_SIZE / 2,
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: 9999,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY * 0.7,
        }}
      />
      {/* Mid-dot on horizontal */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: CORNER_INSET + ARM_LENGTH / 2 - 2,
          top: CORNER_INSET - 2,
          width: 4,
          height: 4,
          borderRadius: 9999,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY * 0.5,
        }}
      />

      {/* ===== TOP-RIGHT CORNER ===== */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: CORNER_INSET,
          top: CORNER_INSET,
          width: ARM_LENGTH,
          height: LINE_THICKNESS,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: CORNER_INSET,
          top: CORNER_INSET,
          width: LINE_THICKNESS,
          height: ARM_LENGTH,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: CORNER_INSET + 12,
          top: CORNER_INSET + 12,
          width: INNER_ARM,
          height: LINE_THICKNESS,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY * 0.6,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: CORNER_INSET + 12,
          top: CORNER_INSET + 12,
          width: LINE_THICKNESS,
          height: INNER_ARM,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY * 0.6,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: CORNER_INSET - DOT_SIZE / 2,
          top: CORNER_INSET - DOT_SIZE / 2,
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: 9999,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: CORNER_INSET + ARM_LENGTH - DOT_SIZE / 2,
          top: CORNER_INSET - DOT_SIZE / 2 + 1,
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: 9999,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY * 0.7,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: CORNER_INSET - DOT_SIZE / 2 + 1,
          top: CORNER_INSET + ARM_LENGTH - DOT_SIZE / 2,
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: 9999,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY * 0.7,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: CORNER_INSET + ARM_LENGTH / 2 - 2,
          top: CORNER_INSET - 2,
          width: 4,
          height: 4,
          borderRadius: 9999,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY * 0.5,
        }}
      />

      {/* ===== BOTTOM-LEFT CORNER ===== */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: CORNER_INSET,
          bottom: CORNER_INSET,
          width: ARM_LENGTH,
          height: LINE_THICKNESS,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: CORNER_INSET,
          bottom: CORNER_INSET,
          width: LINE_THICKNESS,
          height: ARM_LENGTH,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: CORNER_INSET + 12,
          bottom: CORNER_INSET + 12,
          width: INNER_ARM,
          height: LINE_THICKNESS,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY * 0.6,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: CORNER_INSET + 12,
          bottom: CORNER_INSET + 12,
          width: LINE_THICKNESS,
          height: INNER_ARM,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY * 0.6,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: CORNER_INSET - DOT_SIZE / 2,
          bottom: CORNER_INSET - DOT_SIZE / 2,
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: 9999,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: CORNER_INSET + ARM_LENGTH - DOT_SIZE / 2,
          bottom: CORNER_INSET - DOT_SIZE / 2 + 1,
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: 9999,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY * 0.7,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: CORNER_INSET - DOT_SIZE / 2 + 1,
          bottom: CORNER_INSET + ARM_LENGTH - DOT_SIZE / 2,
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: 9999,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY * 0.7,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: CORNER_INSET + ARM_LENGTH / 2 - 2,
          bottom: CORNER_INSET - 2,
          width: 4,
          height: 4,
          borderRadius: 9999,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY * 0.5,
        }}
      />

      {/* ===== BOTTOM-RIGHT CORNER ===== */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: CORNER_INSET,
          bottom: CORNER_INSET,
          width: ARM_LENGTH,
          height: LINE_THICKNESS,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: CORNER_INSET,
          bottom: CORNER_INSET,
          width: LINE_THICKNESS,
          height: ARM_LENGTH,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: CORNER_INSET + 12,
          bottom: CORNER_INSET + 12,
          width: INNER_ARM,
          height: LINE_THICKNESS,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY * 0.6,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: CORNER_INSET + 12,
          bottom: CORNER_INSET + 12,
          width: LINE_THICKNESS,
          height: INNER_ARM,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY * 0.6,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: CORNER_INSET - DOT_SIZE / 2,
          bottom: CORNER_INSET - DOT_SIZE / 2,
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: 9999,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: CORNER_INSET + ARM_LENGTH - DOT_SIZE / 2,
          bottom: CORNER_INSET - DOT_SIZE / 2 + 1,
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: 9999,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY * 0.7,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: CORNER_INSET - DOT_SIZE / 2 + 1,
          bottom: CORNER_INSET + ARM_LENGTH - DOT_SIZE / 2,
          width: DOT_SIZE,
          height: DOT_SIZE,
          borderRadius: 9999,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY * 0.7,
        }}
      />
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          right: CORNER_INSET + ARM_LENGTH / 2 - 2,
          bottom: CORNER_INSET - 2,
          width: 4,
          height: 4,
          borderRadius: 9999,
          backgroundColor: ORNAMENT_COLOR,
          opacity: ORNAMENT_OPACITY * 0.5,
        }}
      />

      {/* Thin border frame inside the ornaments */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          left: CORNER_INSET + 4,
          top: CORNER_INSET + 4,
          right: CORNER_INSET + 4,
          bottom: CORNER_INSET + 4,
          border: `1px solid ${ORNAMENT_COLOR}`,
          opacity: 0.08,
          borderRadius: 2,
        }}
      />

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px 72px',
          width: '100%',
          height: '100%',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={logoSrc} width={44} height={44} />
          <span style={{ color: '#c9a84c', fontSize: 22, marginLeft: 12, fontWeight: 600 }}>
            InferenceX
          </span>
        </div>

        {/* Title & excerpt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860 }}>
          <div
            style={{
              display: 'flex',
              fontSize: titleSize,
              fontWeight: 800,
              color: '#f5f0e1',
              lineHeight: 1.15,
            }}
          >
            {meta.title}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              color: '#c9a84c',
              lineHeight: 1.5,
              opacity: 0.7,
            }}
          >
            {meta.excerpt.length > 140 ? meta.excerpt.slice(0, 140) + '\u2026' : meta.excerpt}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ color: '#c9a84c', fontSize: 18, fontWeight: 600 }}>{meta.author}</span>
          <span style={{ color: '#3d3520', fontSize: 22 }}>{'\u00b7'}</span>
          <span style={{ color: '#8b7a42', fontSize: 18 }}>
            {new Date(meta.date + 'T00:00:00Z').toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
          <span style={{ color: '#3d3520', fontSize: 22 }}>{'\u00b7'}</span>
          <span style={{ color: '#8b7a42', fontSize: 18 }}>{meta.readingTime} min read</span>
        </div>
      </div>
    </div>,
    size,
  );
}
